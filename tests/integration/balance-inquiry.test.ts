import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { WithdrawalService } from '../../apps/desktop/src/main/withdrawal-service';
import {
  FileBalanceJournal,
  parseBalanceJournal,
} from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { SendConfigurationService } from '../../apps/desktop/src/main/send-configuration-service';
import type {
  BalanceContextProvider,
  BalanceTransport,
  BalanceExchangeResult,
} from '../../apps/desktop/src/main/balance-ports';
import type { PreferencesStore } from '../../apps/desktop/src/main/ports';
import type { SendConfigurationFile } from '../../packages/domain/src/send-configuration';
import { networkEvidence } from '../helpers/network-evidence';
import { balanceTarget, balanceRequest, balanceLease } from '../helpers/balance-inquiry';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('Main, proveedor y diario de saldo real en archivo', () => {
  let directory: string;
  let path: string;
  const runtime = {
    agentId: randomUUID(),
    hostname: 'synthetic-station',
    user: 'synthetic-user',
    version: 'test',
    uuid: randomUUID,
    now: () => '2026-10-12T20:00:00.000Z',
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-balance-'));
    path = join(directory, 'balance-executions.json');
  });
  afterEach(async () => removeTestDirectory(directory, 'coonecta-balance-'));
  async function fixture(
    context: BalanceContextProvider | undefined = {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: async (target) => balanceLease(target),
    },
    withdrawalContext?: BalanceContextProvider,
  ) {
    const target = balanceTarget();
    const request = balanceRequest(target);
    const evidence = networkEvidence();
    evidence.ingress = { ...target.endpoint };
    const network = { forEnvironment: () => ({ status: 'DOCUMENTED' as const, evidence }) };
    let config: SendConfigurationFile = { version: 1, configurations: [], audit: [] };
    const setup = new SendConfigurationService(
      {
        read: async () => structuredClone(config),
        write: async (file) => {
          config = structuredClone(file);
        },
      },
      network,
      runtime,
    );
    await setup.save({
      environment: 'QA',
      revision: null,
      values: {
        evidenceId: evidence.id,
        trigger: 'ON_CLICK',
        connectDeadlineMs: 100,
        observationWindowMs: 100,
      },
    });
    let environment = 'QA';
    let revision = 1;
    const preferences: PreferencesStore = {
      read: async () => ({ version: 1, environment: environment as 'QA' | 'PREPROD', audit: [] }),
      write: async (prefs) => {
        environment = prefs.environment;
      },
    };
    const entityId = randomUUID();
    const catalogs = {
      execute: vi.fn(async () => ({
        ok: true as const,
        value: {
          environment: 'QA' as const,
          entities: [
            {
              id: entityId,
              revision: 1,
              status: 'DRAFT' as const,
              createdAt: runtime.now(),
              updatedAt: runtime.now(),
              code: '205',
              name: 'Synthetic CB',
              networkType: 'COONECTA' as const,
              active: true,
            },
          ],
          atms: [
            {
              id: target.draft.atmId!,
              revision,
              status: 'DRAFT' as const,
              createdAt: runtime.now(),
              updatedAt: runtime.now(),
              environment: 'QA' as const,
              alias: 'Synthetic ATM',
              entityId,
              terminalId: target.terminalId,
              acquirerId: 'Synthetic',
              active: true,
            },
          ],
          cases: [],
          audit: [],
        },
      })),
      close: async () => undefined,
    };
    const transport: BalanceTransport = {
      exchange: vi.fn(async (): Promise<BalanceExchangeResult> => ({
        outcome: 'APPROVED',
        transmissionAttempted: true,
        bytesQueued: 536,
        elapsedMs: 20,
        responseCode: '00',
        balances: [{ accountCode: '10', type: '02', currency: '840', amount: '123.45' }],
      })),
    };
    const journal = new FileBalanceJournal(path);
    const service = new BalanceInquiryService(journal, transport, runtime, context);
    const withdrawal = new WithdrawalService(
      new FileBalanceJournal(join(directory, 'withdrawal-executions.json'), 'WITHDRAWAL'),
      transport,
      runtime,
      withdrawalContext,
    );
    const app = new DesktopApplication(
      preferences,
      runtime,
      catalogs,
      undefined,
      undefined,
      undefined,
      undefined,
      network,
      undefined,
      setup,
      service,
      undefined,
      withdrawal,
    );
    return {
      app,
      service,
      transport,
      journal,
      target,
      request,
      catalogs,
      setRevision: (value: number) => {
        revision = value;
      },
      setEnvironment: (value: string) => {
        environment = value;
      },
    };
  }
  it('revalida contexto, devuelve saldo y conserva correlación tras reiniciar sin nuevo envío', async () => {
    const f = await fixture();
    expect(
      await f.app.getBalanceReadiness({
        draft: f.request.draft,
        configurationRevision: 1,
        cardReadId: f.request.cardReadId,
      }),
    ).toMatchObject({ ok: true, value: { ready: true, blockers: [] } });
    const result = await f.app.executeBalance(f.request);
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'APPROVED', responseCode: '00', balances: [{ amount: '123.45' }] },
    });
    const restarted = new BalanceInquiryService(new FileBalanceJournal(path), f.transport, runtime);
    expect(await restarted.find(f.request.requestId)).toEqual(result);
    expect(await f.app.executeBalance(f.request)).toEqual(result);
    expect(f.transport.exchange).toHaveBeenCalledTimes(1);
    const contents = await readFile(path, 'utf8');
    expect(contents).not.toMatch(/wireBytes|privateFields|pan|pinBlock/i);
    expect(parseBalanceJournal(JSON.parse(contents))).toHaveLength(1);
    expect(await f.app.getBalanceHistory({ environment: 'QA' })).toMatchObject({
      ok: true,
      value: [{ requestId: f.request.requestId, outcome: 'APPROVED' }],
    });
    f.setEnvironment('PREPROD');
    expect(await f.app.getBalanceHistory({ environment: 'QA' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });
  it('rechaza PROD, bytes, revisión obsoleta y ambiente cambiado antes del envío', async () => {
    const f = await fixture();
    for (const payload of [
      { ...f.request, pin: 'private' },
      { ...f.request, wire: [1] },
      { ...f.request, draft: { ...f.request.draft, environment: 'PROD' } },
      { ...f.request, configurationRevision: 2 },
    ])
      expect(await f.app.executeBalance(payload)).toMatchObject({ ok: false });
    f.setRevision(2);
    expect(await f.app.executeBalance(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    f.setRevision(1);
    f.setEnvironment('PREPROD');
    expect(await f.app.executeBalance(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('conserva diagnósticos públicos y sigue leyendo registros anteriores sin ellos', async () => {
    const diagnostics = {
      profileId: randomUUID(),
      accountingDate: '2026-10-15',
      terminalApplicationVersion: '008C',
      cardApplicationVersion: '00A0',
      tvr: '8080800000',
      cvmResult: '3F0001',
    };
    const f = await fixture({
      inspect: async () => ({ ready: true, blockers: [], sequencesRemaining: 1 }),
      acquire: async (target) => ({ ...balanceLease(target), diagnostics }),
    });
    const result = await f.app.executeBalance(f.request);
    expect(result).toMatchObject({ ok: true, value: { diagnostics } });
    const [stored] = await f.journal.read();
    expect(stored?.diagnostics).toEqual(diagnostics);
    expect(
      parseBalanceJournal({
        version: 1,
        executions: [{ ...stored, diagnostics: { ...diagnostics, pin: 'PRIVATE' } }],
      }),
    ).toBeUndefined();
    const legacy = { ...stored };
    delete legacy.diagnostics;
    expect(parseBalanceJournal({ version: 1, executions: [legacy] })).toHaveLength(1);
  });
  it('protege cambios y doble clic mientras el proveedor está preparando la consulta', async () => {
    let complete: ((lease: ReturnType<typeof balanceLease>) => void) | undefined;
    const f = await fixture({
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    });
    const executing = f.app.executeBalance(f.request);
    expect(f.app.isFinancialBusy()).toBe(true);
    await vi.waitFor(() => expect(complete).toBeDefined());
    expect(await f.app.executeBalance(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await f.app.setEnvironment({ environment: 'PREPROD' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await f.app.catalog('saveAtm', {})).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await f.app.saveSendConfiguration({})).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    complete!(balanceLease(f.target));
    expect(await executing).toMatchObject({ ok: true, value: { outcome: 'APPROVED' } });
    expect(f.app.isFinancialBusy()).toBe(false);
  });
  it('conserva archivos corruptos/futuros, límites y registros con datos adicionales', async () => {
    const f = await fixture();
    for (const contents of [
      'corrupt-private',
      JSON.stringify({ version: 9, executions: [] }),
      'x'.repeat(512 * 1024 + 1),
    ]) {
      await writeFile(path, contents);
      expect(await f.app.executeBalance(f.request)).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
      expect(await readFile(path, 'utf8')).toBe(contents);
    }
    expect(f.transport.exchange).not.toHaveBeenCalled();
    expect(parseBalanceJournal({ version: 1, executions: [], raw: 'private' })).toBeUndefined();
    await writeFile(path, JSON.stringify({ version: 1, executions: [] }));
    await f.app.executeBalance(f.request);
    const records = await f.journal.read();
    expect(
      parseBalanceJournal({ version: 1, executions: [{ ...records[0], pin: 'private' }] }),
    ).toBeUndefined();
  });
  it('un registro PENDING persiste como resultado incierto y jamás se vuelve a enviar', async () => {
    const f = await fixture();
    const done = await f.app.executeBalance(f.request);
    if (!done.ok) throw Error('TEST_SETUP');
    await f.journal.write([
      { ...done.value, outcome: 'PENDING', finishedAt: null, responseCode: null, balances: [] },
    ]);
    expect(await f.app.executeBalance(f.request)).toMatchObject({
      ok: true,
      value: { outcome: 'PENDING' },
    });
    expect(f.transport.exchange).toHaveBeenCalledTimes(1);
  });
  it('separa los canales de saldo/retiro y muestra las dependencias pendientes sin transporte', async () => {
    const f = await fixture();
    const request = {
      ...f.request,
      draft: { ...f.request.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' },
    };
    expect(await f.app.executeBalance(request)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await f.app.executeWithdrawal(f.request)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await f.app.executeWithdrawal({ ...request, emv: { transactionType: '01' } }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(await f.app.executeWithdrawal(request)).toMatchObject({
      ok: true,
      value: { outcome: 'BLOCKED', withdrawal: { amount: '20.00' }, transmissionAttempted: false },
    });
    expect(
      await f.app.getWithdrawalReadiness({
        draft: request.draft,
        cardReadId: request.cardReadId,
        configurationRevision: request.configurationRevision,
      }),
    ).toMatchObject({
      ok: true,
      value: {
        ready: false,
        blockers: [
          { id: 'QA-WITHDRAWAL-EMV-GENERATION' },
          { id: 'AMOUNT-RULES' },
          { id: 'QA-WITHDRAWAL-RESULT-RULES' },
        ],
      },
    });
    expect(await f.app.getWithdrawalHistory({ environment: 'QA' })).toEqual({
      ok: true,
      value: [],
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('termina el retiro 91 en Main y permite otra solicitud con lectura nueva', async () => {
    const acquire = vi.fn(async (target: ReturnType<typeof balanceTarget>) => ({
      ...balanceLease(target),
      amount: '20.00',
    }));
    const f = await fixture(undefined, {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire,
    });
    vi.mocked(f.transport.exchange).mockResolvedValue({
      outcome: 'NOT_APPROVED',
      responseCode: '91',
      transmissionAttempted: true,
      bytesQueued: 548,
      elapsedMs: 20,
      balances: [],
    });
    const request = {
      ...f.request,
      draft: { ...f.request.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' },
    };
    const result = await f.app.executeWithdrawal(request);
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'NOT_APPROVED', responseCode: '91' },
    });
    expect(
      await f.app.getWithdrawalExecution({ environment: 'QA', requestId: request.requestId }),
    ).toEqual(result);
    expect(await f.app.executeWithdrawal(request)).toEqual(result);
    expect(f.transport.exchange).toHaveBeenCalledTimes(1);
    const next = { ...request, requestId: randomUUID(), cardReadId: randomUUID() };
    expect(await f.app.executeWithdrawal(next)).toMatchObject({
      ok: true,
      value: { outcome: 'NOT_APPROVED', requestId: next.requestId, cardReadId: next.cardReadId },
    });
    expect(acquire).toHaveBeenCalledTimes(2);
    expect(f.transport.exchange).toHaveBeenCalledTimes(2);
  });
  it('excluye saldo y cambios de entorno mientras hay un retiro en preparación', async () => {
    let resolve!: (lease: ReturnType<typeof balanceLease>) => void;
    const acquire = vi.fn(
      () =>
        new Promise<ReturnType<typeof balanceLease>>((done) => {
          resolve = done;
        }),
    );
    const f = await fixture(undefined, {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire,
    });
    const request = {
      ...f.request,
      draft: { ...f.request.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' },
    };
    const executing = f.app.executeWithdrawal(request);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(1));
    expect(await f.app.executeBalance(f.request)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await f.app.setEnvironment({ environment: 'PREPROD' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await f.app.saveSendConfiguration({})).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    // Expired lease ends locally; no simulated approval is needed for the lock test.
    resolve({ ...balanceLease(f.target), amount: '20.00', validUntil: '2020-01-01T00:00:00.000Z' });
    expect(await executing).toMatchObject({
      ok: true,
      value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
});
