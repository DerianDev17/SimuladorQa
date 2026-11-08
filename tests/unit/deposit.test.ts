import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  depositBlocksNewExecution,
  parseDepositContextRequest,
  parseDepositDetails,
  parseDepositExecutionRequest,
} from '../../packages/domain/src/deposit';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import type {
  BalanceContextProvider,
  BalanceExchangeResult,
} from '../../apps/desktop/src/main/balance-ports';
import { DepositService } from '../../apps/desktop/src/main/deposit-service';
import { NewVisaDeposit } from '../../apps/desktop/src/main/adapters/new-visa-deposit';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { QaOperationCatalog } from '../../apps/desktop/src/main/adapters/qa-operation-catalog';
import { CmsV36Catalog } from '../../apps/desktop/src/main/adapters/cms-v36-catalog';
import { QaEmvOperation } from '../../apps/desktop/src/main/adapters/qa-emv-operation';
import { parseCardTlv } from '../../apps/desktop/src/main/adapters/emv-card-identity';
import { depositFixture, depositResponse } from '../helpers/deposit';
import { fakeCardSession } from '../helpers/card-identity';
import {
  qaAcResponse,
  qaCalendar,
  qaCardFields,
  qaExecutionFixture,
} from '../helpers/qa-execution';

const runtime = {
  agentId: randomUUID(),
  hostname: 'test-station',
  user: 'test-user',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-12T20:00:00.000Z',
};
const deadlines = { connect: 100, response: 100 };
function serviceFixture(context?: BalanceContextProvider, deadline = 50) {
  let records: BalanceExecution[] = [];
  const journal = {
    read: async () => structuredClone(records),
    write: vi.fn(async (items: readonly BalanceExecution[]) => {
      records = structuredClone([...items]);
    }),
  };
  const transport = {
    exchange: vi.fn(async (): Promise<BalanceExchangeResult> => ({
      outcome: 'NOT_APPROVED',
      transmissionAttempted: true,
      bytesQueued: 500,
      elapsedMs: 1,
      responseCode: '12',
      balances: [],
    })),
  };
  return {
    journal,
    transport,
    service: new DepositService(journal, transport, runtime, context, deadline),
  };
}

describe('contrato de depósito QA', () => {
  it.each(['0.01', '10.00', '75.25', '9999999999.99'])('acepta importe técnico %s', (amount) => {
    const { request } = depositFixture(amount);
    expect(parseDepositExecutionRequest(request)).toEqual(request);
    expect(
      parseDepositDetails({ transaction: 'DEPOSIT', account: 'SAVINGS', currency: '840', amount }),
    ).toBeDefined();
  });
  it.each(['0.00', '-1.00', '01.00', '10', '10.0', '1e2', '1,00', '10000000000.00'])(
    'rechaza importe %s antes de seguridad',
    (amount) => {
      expect(parseDepositExecutionRequest(depositFixture(amount).request)).toBeUndefined();
    },
  );
  it.each([
    { environment: 'PROD' },
    { environment: 'PREPROD' },
    { scenario: 'BANRED' },
    { account: 'CURRENT' },
    { transaction: 'WITHDRAWAL_APPROVED' },
    { atmId: null, atmRevision: null },
    { atmRevision: 0 },
    { amount: null },
  ])('rechaza borrador fuera del alcance %j', (changes) => {
    const { request } = depositFixture();
    expect(
      parseDepositExecutionRequest({ ...request, draft: { ...request.draft, ...changes } }),
    ).toBeUndefined();
  });
  it('rechaza propiedades extra, reverso, UUID inválidos y detalles ajenos', () => {
    const { request } = depositFixture();
    for (const changes of [
      { reversalDelaySeconds: 1 },
      { extra: true },
      { requestId: 'invalid' },
      { cardReadId: 'invalid' },
      { configurationRevision: 0 },
    ])
      expect(parseDepositExecutionRequest({ ...request, ...changes })).toBeUndefined();
    expect(parseDepositContextRequest(request)).toBeUndefined();
    const details = {
      transaction: 'DEPOSIT',
      account: 'SAVINGS',
      currency: '840',
      amount: '10.00',
    };
    for (const changes of [
      { currency: '978' },
      { transaction: 'WITHDRAWAL_APPROVED' },
      { extra: 1 },
    ])
      expect(parseDepositDetails({ ...details, ...changes })).toBeUndefined();
  });
  it('preserva catálogo CMS y atribuye depósito exclusivamente a la instrucción QA', () => {
    const catalog = new QaOperationCatalog();
    expect(catalog.entries.slice(0, -1)).toEqual(new CmsV36Catalog().entries);
    expect(catalog.entries.filter((item) => item.transaction === 'DEPOSIT')).toEqual([
      expect.objectContaining({
        account: 'SAVINGS',
        code: '211000',
        source: expect.objectContaining({ document: 'docs/transactions/DEPOSIT.md' }),
      }),
    ]);
    expect(Object.isFrozen(catalog.entries)).toBe(true);
  });
});

describe('builder y seguridad de depósito', () => {
  it('genera 0200/211000 con F4 exacto y proyección sanitizada', () => {
    const built = new NewVisaDeposit().build(depositFixture('75.25').lease);
    const decoder = new CapturedVisaFraming().decoder();
    const frames = decoder.push(built.wire);
    decoder.finish();
    expect(frames).toHaveLength(1);
    expect(new CapturedVisaBalance('DEPOSIT').inspect(frames[0]!.opaqueBody)).toMatchObject({
      mti: '0200',
      processingCode: '211000',
      amount: '7525'.padStart(12, '0'),
      currency: '840',
    });
    expect(JSON.stringify(built.message)).not.toMatch(/\b\d{16,19}\b/);
    expect(
      new CapturedVisaBalance('DEPOSIT').response(depositResponse(built.metadata)),
    ).toMatchObject({
      metadata: { mti: '0210', responseCode: '12', processingCode: '211000' },
      balances: [],
    });
    expect(() => new CapturedVisaBalance().inspect(frames[0]!.opaqueBody)).toThrow();
    expect(() => new NewVisaDeposit().build({ ...depositFixture().lease, amount: '0.00' })).toThrow(
      'DEPOSIT_AMOUNT_INVALID',
    );
  });
  it('vincula 9F02 al importe y 9C=30 en CDOL y F55 sin reutilizar AC', async () => {
    const { profile } = qaExecutionFixture();
    const counters: string[] = [];
    const nonces: string[] = [];
    for (const atc of [1, 2]) {
      const fake = fakeCardSession([qaAcResponse(atc)]);
      const commands: Buffer[] = [];
      const transmit = fake.session.transmit;
      fake.session.transmit = async (command) => {
        commands.push(Buffer.from(command));
        return transmit(command);
      };
      const output = await new QaEmvOperation().generate(
        fake.session,
        qaCardFields(),
        {
          ...profile.emv,
          issuerUsage: 'SERVICES',
          transactionType: '30',
          amountSource: 'DEPOSIT_AMOUNT',
        },
        qaCalendar,
        new AbortController().signal,
        undefined,
        '75.25',
      );
      const tags = new Map(parseCardTlv(output).map((tag) => [tag.tag, Buffer.from(tag.value)]));
      expect(tags.get('9F02')?.toString('hex')).toBe('7525'.padStart(12, '0'));
      expect(tags.get('9C')?.toString('hex')).toBe('30');
      expect(commands[0]!.subarray(5, 11).toString('hex')).toBe('7525'.padStart(12, '0'));
      counters.push(tags.get('9F36')!.toString('hex'));
      nonces.push(tags.get('9F37')!.toString('hex'));
    }
    expect(counters).toEqual(['0001', '0002']);
    expect(nonces[0]).not.toBe(nonces[1]);
  });
});

describe('servicio de depósito', () => {
  it('sin proveedor queda bloqueado y nunca usa seguridad de saldo', async () => {
    const f = serviceFixture();
    const { request, target } = depositFixture();
    expect(await f.service.inspect(target)).toMatchObject({
      ready: false,
      blockers: [{ id: 'QA-DEPOSIT-CONTEXT' }],
    });
    expect(await f.service.execute(request, target, deadlines, async () => true)).toMatchObject({
      ok: true,
      value: { outcome: 'BLOCKED', transmissionAttempted: false },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it.each(['error', 'timeout'] as const)(
    'cierra sin transmisión ante %s de contexto',
    async (mode) => {
      const f = serviceFixture(
        {
          inspect: async () => ({ ready: true, blockers: [] }),
          acquire: () =>
            mode === 'timeout'
              ? new Promise(() => undefined)
              : Promise.reject(Error('PRIVATE_PROVIDER_ERROR')),
        },
        10,
      );
      const { request, target } = depositFixture();
      const result = await f.service.execute(request, target, deadlines, async () => true);
      expect(result).toMatchObject({
        ok: true,
        value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
      });
      expect(JSON.stringify(result)).not.toContain('PRIVATE_PROVIDER_ERROR');
      expect(f.transport.exchange).not.toHaveBeenCalled();
      expect(f.service.isBusy()).toBe(false);
    },
  );
  it('rechaza monto inválido sin solicitar PIN ni contexto', async () => {
    const acquire = vi.fn();
    const f = serviceFixture({ inspect: async () => ({ ready: true, blockers: [] }), acquire });
    const { request, target } = depositFixture('0.00');
    expect(await f.service.execute(request, target, deadlines, async () => true)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(acquire).not.toHaveBeenCalled();
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('persiste PENDING antes de TCP, RC12 e idempotencia y borra material temporal', async () => {
    const input = depositFixture();
    const acquire = vi.fn(async () => input.lease);
    const f = serviceFixture({ inspect: async () => ({ ready: true, blockers: [] }), acquire });
    f.transport.exchange.mockImplementationOnce(async () => {
      expect(await f.journal.read()).toMatchObject([
        { outcome: 'PENDING', deposit: { amount: '10.00' } },
      ]);
      return {
        outcome: 'NOT_APPROVED',
        transmissionAttempted: true,
        bytesQueued: 500,
        elapsedMs: 1,
        responseCode: '12',
        balances: [],
      };
    });
    const result = await f.service.execute(
      input.request,
      input.target,
      deadlines,
      async () => true,
    );
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'NOT_APPROVED', responseCode: '12', deposit: { amount: '10.00' } },
    });
    if (!result.ok) throw Error('TEST_SETUP');
    expect(depositBlocksNewExecution(result.value)).toBe(false);
    expect(
      await f.service.execute(input.request, input.target, deadlines, async () => true),
    ).toEqual(result);
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(f.transport.exchange).toHaveBeenCalledTimes(1);
    expect(input.lease.header.every((byte) => byte === 0)).toBe(true);
    for (const value of input.lease.privateFields.values())
      expect(value.every((byte) => byte === 0)).toBe(true);
    for (const outcome of [
      'PENDING',
      'STORAGE_ERROR',
      'REQUIRES_REVIEW',
      'RESPONSE_TIMEOUT',
      'INVALID_RESPONSE',
    ] as const)
      expect(depositBlocksNewExecution({ ...result.value, outcome })).toBe(true);
    expect(depositBlocksNewExecution({ ...result.value, finishedAt: null })).toBe(true);
    const balanceOnly = { ...result.value };
    delete balanceOnly.deposit;
    expect(depositBlocksNewExecution(balanceOnly)).toBe(false);
  });
});
