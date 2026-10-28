import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PhysicalCardLoadDriver } from '../../apps/desktop/src/main/physical-card-load-driver';
import { LoadPinSession } from '../../apps/desktop/src/main/adapters/load-pin-session';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import type { LoadRunRequest } from '../../packages/domain/src/load-run';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import { parseBalanceExecutionRequest } from '../../packages/domain/src/balance-inquiry';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import type { DesktopApplication } from '../../apps/desktop/src/main/application';

function fixture() {
  const original: CardIdentityReading = {
    readId: randomUUID(),
    readAt: new Date().toISOString(),
    readerName: 'Synthetic',
    status: 'READ',
    applications: [],
    applicationId: 'A1B2C3D4E5F6',
    applicationLabel: 'QA',
    panMasked: '************2267',
    cardholderName: null,
    expiry: null,
  };
  const input: LoadRunRequest = {
    requestId: randomUUID(),
    cardReadId: original.readId,
    draft: {
      environment: 'QA',
      operation: 'BALANCE',
      mode: 'LOAD',
      atmId: randomUUID(),
      atmRevision: 1,
      targetTps: 5,
      concurrency: 1,
      maxTransactions: 2,
      durationSeconds: 60,
      rampUpSeconds: 0,
    },
  };
  const cards = {
    beginLoadSession: vi.fn(),
    endLoadSession: vi.fn(),
    current: vi.fn(async () => original),
    read: vi.fn(async () => ({ ok: true as const, value: { ...original, readId: randomUUID() } })),
  };
  const ask = vi.fn(async () => Uint8Array.of(1, 2, 3, 4));
  const pins = new LoadPinSession({ request: ask });
  const application: Pick<
    DesktopApplication,
    'getSendConfiguration' | 'getBalanceReadiness' | 'executeBalance'
  > = {
    getSendConfiguration: vi.fn(async () => ({
      ok: true as const,
      value: {
        environment: 'QA' as const,
        status: 'CONFIGURED_BLOCKED' as const,
        documentedEndpoint: null,
        pending: [],
        configuration: {
          id: randomUUID(),
          revision: 1,
          environment: 'QA' as const,
          updatedAt: original.readAt,
          evidenceId: randomUUID(),
          trigger: 'ON_CLICK' as const,
          connectDeadlineMs: 1000,
          observationWindowMs: 1000,
          endpoint: { host: '127.0.0.1', port: 16100 },
        },
      },
    })),
    getBalanceReadiness: vi.fn(async () => ({
      ok: true as const,
      value: { ready: true, blockers: [], sequencesRemaining: 10 },
    })),
    executeBalance: vi.fn(async (_payload, _operation, execution) => {
      execution?.onPhase?.('context', 12);
      execution?.onPhase?.('transport', 8);
      const pin = await pins.request(execution!.signal);
      pin!.fill(0);
      const value = approvedWithdrawalExecution();
      delete value.withdrawal;
      return { ok: true as const, value: { ...value, runId: execution!.runId } };
    }),
  };
  const journal = { read: vi.fn(async () => [] as BalanceExecution[]), write: vi.fn() };
  const runtime = {
    agentId: randomUUID(),
    hostname: 'test',
    user: 'test',
    version: 'test',
    uuid: randomUUID,
    now: () => new Date().toISOString(),
  };
  const cipher = { begin: vi.fn(), end: vi.fn() };
  return {
    driver: new PhysicalCardLoadDriver(
      cards,
      application,
      pins,
      journal,
      runtime,
      () => {},
      cipher,
    ),
    cipher,
    cards,
    application,
    ask,
    input,
    journal,
  };
}
describe('adaptador de carga con tarjeta física', () => {
  it('acota los helpers a la corrida y limpia un arranque fallido', async () => {
    const f = fixture();
    const prepared = await f.driver.prepare(f.input);
    if (!prepared.ok) throw Error('PREPARE');
    expect(f.cards.beginLoadSession).toHaveBeenCalledOnce();
    expect(f.cipher.begin).toHaveBeenCalledOnce();
    prepared.value.close();
    prepared.value.close();
    expect(f.cards.endLoadSession).toHaveBeenCalledOnce();
    expect(f.cipher.end).toHaveBeenCalledOnce();
    f.cipher.begin.mockImplementationOnce(() => {
      throw Error('UNAVAILABLE');
    });
    await expect(f.driver.prepare(f.input)).rejects.toThrow('UNAVAILABLE');
    expect(f.cards.endLoadSession).toHaveBeenCalledTimes(2);
    expect(f.cipher.end).toHaveBeenCalledTimes(2);
  });
  it('descarta sin leer ni enviar un slot que vence mientras espera el lector', async () => {
    const f = fixture();
    f.input.draft.concurrency = 2;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(f.application.executeBalance).mockImplementationOnce(async () => {
      await held;
      const value = approvedWithdrawalExecution();
      delete value.withdrawal;
      return { ok: true, value };
    });
    const prepared = await f.driver.prepare(f.input);
    if (!prepared.ok) throw Error('PREPARE');
    const deadline = performance.now() + 30;
    const runId = randomUUID(),
      signal = new AbortController().signal;
    const first = prepared.value.execute(signal, runId, { index: 0, deadline });
    const second = prepared.value.execute(signal, runId, { index: 1, deadline });
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    await first;
    expect(await second).toMatchObject({ skipped: 'DURATION' });
    expect(f.cards.read).not.toHaveBeenCalled();
    expect(f.application.executeBalance).toHaveBeenCalledOnce();
    prepared.value.close();
  });
  it.each(['unavailable', 'revoked', 'sequences'] as const)(
    'no inicia ni pide PIN si el segundo ATM falla la validación: %s',
    async (reason) => {
      const f = fixture();
      const request = {
        ...f.input,
        draft: { ...f.input.draft, additionalAtms: [{ atmId: randomUUID(), atmRevision: 1 }] },
      };
      vi.mocked(f.application.getBalanceReadiness)
        .mockResolvedValueOnce({
          ok: true,
          value: { ready: true, blockers: [], sequencesRemaining: 2 },
        })
        .mockResolvedValueOnce(
          reason === 'unavailable'
            ? {
                ok: false,
                error: { code: 'SERVICE_UNAVAILABLE', message: 'Perfil no disponible.' },
              }
            : {
                ok: true,
                value: {
                  ready: reason === 'sequences',
                  blockers:
                    reason === 'revoked' ? [{ id: 'ATM-CHANGED', label: 'ATM cambiado.' }] : [],
                  sequencesRemaining: 1,
                },
              },
        );
      expect(await f.driver.prepare(request)).toMatchObject({ ok: false });
      expect(f.application.executeBalance).not.toHaveBeenCalled();
      expect(f.ask).not.toHaveBeenCalled();
    },
  );
  it('no suma dos veces las reservas compartidas al validar dos perfiles', async () => {
    const f = fixture();
    const request = {
      ...f.input,
      draft: {
        ...f.input.draft,
        maxTransactions: 3,
        additionalAtms: [{ atmId: randomUUID(), atmRevision: 1 }],
      },
    };
    vi.mocked(f.application.getBalanceReadiness).mockResolvedValue({
      ok: true,
      value: { ready: true, blockers: [], sequencesRemaining: 2 },
    });
    expect(await f.driver.prepare(request)).toMatchObject({ ok: false });
    expect(f.ask).not.toHaveBeenCalled();
  });
  it('valida ambos ATM y alterna A/B/A con PIN único e identificadores nuevos', async () => {
    const f = fixture();
    const second = { atmId: randomUUID(), atmRevision: 2 };
    const request = {
      ...f.input,
      draft: { ...f.input.draft, maxTransactions: 3, additionalAtms: [second] },
    };
    const prepared = await f.driver.prepare(request);
    expect(f.application.getBalanceReadiness).toHaveBeenCalledTimes(2);
    if (!prepared.ok) throw Error('READY');
    try {
      const signal = new AbortController().signal;
      const runId = randomUUID();
      for (let index = 0; index < 3; index++) await prepared.value.execute(signal, runId);
      const calls = vi.mocked(f.application.executeBalance).mock.calls;
      const requests = calls.map(([value]) => parseBalanceExecutionRequest(value)!);
      expect(requests.map((value) => value.draft.atmId)).toEqual([
        request.draft.atmId,
        second.atmId,
        request.draft.atmId,
      ]);
      expect(requests.map((value) => value.draft.atmRevision)).toEqual([1, 2, 1]);
      expect(new Set(requests.map((value) => value.requestId)).size).toBe(3);
      expect(new Set(requests.map((value) => value.cardReadId)).size).toBe(3);
      expect(calls.every(([, , execution]) => execution?.runId === runId)).toBe(true);
      expect(f.ask).toHaveBeenCalledOnce();
    } finally {
      prepared.value.close();
    }
  });
  it('relee el chip, pide PIN una vez y entrega IDs nuevos bajo el mismo runId', async () => {
    const f = fixture();
    const source = await f.driver.prepare(f.input);
    if (!source.ok) throw Error('READY');
    const runId = randomUUID();
    const signal = new AbortController().signal;
    const first = await source.value.execute(signal, runId);
    await source.value.execute(signal, runId);
    expect(first).toMatchObject({
      ok: true,
      value: { loadTimings: { contextMs: 12, transportMs: 8 } },
    });
    expect(f.cards.read).toHaveBeenCalledTimes(1);
    expect(f.ask).toHaveBeenCalledTimes(1);
    const calls = vi.mocked(f.application.executeBalance).mock.calls;
    expect(calls[0]![0]).not.toEqual(calls[1]![0]);
    expect(calls.map((call) => call[2]?.runId)).toEqual([runId, runId]);
    source.value.close();
  });
  it('rechaza una referencia obsoleta y la falta de secuencias antes de pedir PIN', async () => {
    const f = fixture();
    expect(await f.driver.prepare({ ...f.input, cardReadId: randomUUID() })).toMatchObject({
      ok: false,
    });
    vi.mocked(f.application.getBalanceReadiness).mockResolvedValue({
      ok: true,
      value: { ready: true, blockers: [], sequencesRemaining: 0 },
    });
    expect(await f.driver.prepare(f.input)).toMatchObject({ ok: false });
    expect(f.ask).not.toHaveBeenCalled();
    expect(f.application.executeBalance).not.toHaveBeenCalled();
  });
  it('muestra todas las dependencias del ATM seleccionado sin pedir PIN ni transmitir', async () => {
    const f = fixture();
    vi.mocked(f.application.getBalanceReadiness).mockResolvedValue({
      ok: true,
      value: {
        ready: false,
        blockers: [
          { id: 'QA-DIRECT-PIN-KEY-BINDING', label: 'ATM20524: falta vínculo de cifrado' },
          { id: 'QA-EXECUTION-PROFILE-BINDING', label: 'Falta perfil ISO y reserva propia' },
        ],
      },
    });
    expect(await f.driver.prepare(f.input)).toMatchObject({
      ok: false,
      error: {
        code: 'CONFLICT',
        message: 'ATM20524: falta vínculo de cifrado. Falta perfil ISO y reserva propia',
      },
    });
    expect(f.ask).not.toHaveBeenCalled();
    expect(f.application.executeBalance).not.toHaveBeenCalled();
  });
  it('detiene la corrida cuando cambia la tarjeta o falla la nueva lectura', async () => {
    const f = fixture();
    const source = await f.driver.prepare(f.input);
    if (!source.ok) throw Error('READY');
    const signal = new AbortController().signal;
    const runId = randomUUID();
    await source.value.execute(signal, runId);
    f.cards.read.mockResolvedValue({
      ok: true,
      value: { ...(await f.cards.current()), readId: randomUUID(), panMasked: '************9999' },
    });
    expect(await source.value.execute(signal, runId)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(f.application.executeBalance).toHaveBeenCalledTimes(1);
    source.value.close();
  });
  it('un envío pendiente bloquea una nueva corrida antes de pedir PIN', async () => {
    const f = fixture();
    f.journal.read.mockResolvedValue([
      { ...approvedWithdrawalExecution(), outcome: 'PENDING', finishedAt: null },
    ]);
    expect(await f.driver.prepare(f.input)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(f.ask).not.toHaveBeenCalled();
  });
  it('conserva errores históricos sin impedir nuevas consultas de saldo explícitas', async () => {
    const f = fixture();
    const previous = {
      ...approvedWithdrawalExecution(),
      outcome: 'RESPONSE_TIMEOUT' as const,
      responseCode: null,
    };
    delete previous.withdrawal;
    f.journal.read.mockResolvedValue([previous]);
    const prepared = await f.driver.prepare(f.input);
    expect(prepared.ok).toBe(true);
    expect(f.journal.read).toHaveBeenCalledOnce();
    expect(f.application.executeBalance).not.toHaveBeenCalled();
    if (prepared.ok) prepared.value.close();
  });
});
