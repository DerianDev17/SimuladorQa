import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  isWithdrawalAmount,
  parseWithdrawalContextRequest,
  parseWithdrawalExecutionRequest,
} from '../../packages/domain/src/withdrawal';
import {
  balanceDeliveryUncertain,
  balanceResponseConfirmed,
  canStartAfterUnconfirmedWithdrawal,
  hasWithdrawalQaContinuation,
  withdrawalHostNotApproved,
  withdrawalBlocksNewExecution,
  parseBalanceExecutionRequest,
  type BalanceExecution,
} from '../../packages/domain/src/balance-inquiry';
import { NewVisaWithdrawal } from '../../apps/desktop/src/main/adapters/new-visa-withdrawal';
import { NewVisaBalance } from '../../apps/desktop/src/main/adapters/new-visa-balance';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { WithdrawalService } from '../../apps/desktop/src/main/withdrawal-service';
import { BalanceExecutionView } from '../../apps/desktop/src/renderer/BalanceExecutionView';
import type {
  BalanceContextProvider,
  BalanceExchangeResult,
} from '../../apps/desktop/src/main/balance-ports';
import { parseBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { withdrawalFixture, withdrawalResponse } from '../helpers/withdrawal';
import { fixtureFields } from '../helpers/balance-inquiry';

const runtime = {
  agentId: randomUUID(),
  hostname: 'test-station',
  user: 'test-user',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-12T20:00:00.000Z',
};
function serviceFixture(provider?: BalanceContextProvider, deadline = 30) {
  let records: BalanceExecution[] = [];
  const journal = {
    read: async () => structuredClone(records),
    write: vi.fn(async (value: readonly BalanceExecution[]) => {
      records = structuredClone([...value]);
    }),
  };
  const transport = {
    exchange: vi.fn(async (): Promise<BalanceExchangeResult> => ({
      outcome: 'APPROVED',
      transmissionAttempted: true,
      bytesQueued: 548,
      elapsedMs: 15,
      responseCode: '00',
      balances: [],
    })),
  };
  const service = new WithdrawalService(journal, transport, runtime, provider, deadline);
  return { service, transport, journal, records: () => records };
}
const deadlines = { connect: 100, response: 100 };

async function nonApprovedWithdrawal() {
  const input = withdrawalFixture();
  const acquire = vi.fn(async () => input.lease);
  const f = serviceFixture({ inspect: async () => ({ ready: true, blockers: [] }), acquire });
  f.transport.exchange.mockResolvedValue({
    outcome: 'NOT_APPROVED',
    responseCode: '91',
    transmissionAttempted: true,
    bytesQueued: 548,
    elapsedMs: 20,
    balances: [],
  });
  const result = await f.service.execute(input.request, input.target, deadlines, async () => true);
  if (!result.ok) throw Error('TEST_SETUP');
  expect(result.value.outcome).toBe('NOT_APPROVED');
  return { ...f, ...input, acquire, previous: result.value };
}

describe('resultado de retiro separado de conciliacion', () => {
  it.each([
    'REQUIRES_REVIEW',
    'RESPONSE_TIMEOUT',
    'CONNECT_TIMEOUT',
    'PEER_CLOSED',
    'TRANSPORT_ERROR',
    'INVALID_RESPONSE',
  ] as const)(
    'permite una operación nueva tras %s sin resolver el resultado original',
    async (outcome) => {
      const f = await nonApprovedWithdrawal();
      const record = { ...f.previous, outcome, responseCode: null };
      expect(canStartAfterUnconfirmedWithdrawal(record)).toBe(true);
      expect(balanceDeliveryUncertain(record)).toBe(true);
      expect(canStartAfterUnconfirmedWithdrawal({ ...record, finishedAt: null })).toBe(false);
      const balanceOnly = { ...record };
      delete balanceOnly.withdrawal;
      expect(canStartAfterUnconfirmedWithdrawal(balanceOnly)).toBe(false);
      expect(canStartAfterUnconfirmedWithdrawal({ ...record, outcome: 'STORAGE_ERROR' })).toBe(
        false,
      );
      const reversal = {
        transactionId: randomUUID(),
        delaySeconds: 5,
        outcome: 'UNCONFIRMED' as const,
        dueAt: null,
        finishedAt: record.finishedAt,
        responseCode: null,
        transmissionAttempted: true,
        bytesQueued: 100,
      };
      expect(canStartAfterUnconfirmedWithdrawal({ ...record, reversal })).toBe(true);
      expect(
        withdrawalBlocksNewExecution({ ...record, reversal: { ...reversal, finishedAt: null } }),
      ).toBe(true);
    },
  );
  it.each(['NOT_APPROVED', 'REQUIRES_REVIEW'] as const)(
    'presenta 91 como no aprobado, incluido registro %s',
    async (outcome) => {
      const f = await nonApprovedWithdrawal();
      const record = { ...f.previous, outcome };
      expect(withdrawalHostNotApproved(record)).toBe(true);
      expect(balanceDeliveryUncertain(record)).toBe(false);
      expect(balanceResponseConfirmed(record)).toBe(true);
      expect(withdrawalBlocksNewExecution(record)).toBe(false);
      expect(parseBalanceJournal({ version: 1, executions: [record] })).toEqual([record]);
      const markup = renderToStaticMarkup(
        createElement(BalanceExecutionView, { execution: record }),
      );
      expect(markup).toContain('Retiro no aprobado');
      expect(markup).toContain('El emisor o el switch no está operativo (91)');
      expect(markup).toContain('Respuesta del host recibida');
      expect(markup).not.toMatch(/conciliación|No repitas|Nueva prueba QA/);
      expect(
        await f.service.execute(f.request, f.target, deadlines, async () => true),
      ).toMatchObject({ ok: true, value: f.previous });
      expect(f.acquire).toHaveBeenCalledTimes(1);
      expect(f.transport.exchange).toHaveBeenCalledTimes(1);
    },
  );
  it('conserva auditorias historicas sin exigirlas ni reescribir el resultado', async () => {
    const f = await nonApprovedWithdrawal();
    const old = {
      ...f.previous,
      outcome: 'REQUIRES_REVIEW' as const,
      qaContinuation: { id: randomUUID(), agentId: runtime.agentId, createdAt: runtime.now() },
    };
    expect(hasWithdrawalQaContinuation(old)).toBe(true);
    expect(parseBalanceJournal({ version: 1, executions: [old] })).toEqual([old]);
    expect(withdrawalBlocksNewExecution(old)).toBe(false);
    expect(
      parseBalanceJournal({
        version: 1,
        executions: [{ ...old, qaContinuation: { ...old.qaContinuation, pin: 'PRIVATE' } }],
      }),
    ).toBeUndefined();
  });
  it.each([
    { outcome: 'PENDING', finishedAt: null },
    { outcome: 'STORAGE_ERROR' },
    { outcome: 'RESPONSE_TIMEOUT', responseCode: null },
    { outcome: 'REQUIRES_REVIEW', responseCode: '10' },
    { outcome: 'REQUIRES_REVIEW', responseCode: '00' },
    { outcome: 'REQUIRES_REVIEW', responseCode: '96' },
    { outcome: 'REQUIRES_REVIEW', correlation: null },
  ] as Partial<BalanceExecution>[])(
    'no convierte incertidumbre o parcial en rechazo %j',
    async (patch) => {
      const f = await nonApprovedWithdrawal();
      const record = { ...f.previous, ...patch };
      expect(withdrawalHostNotApproved(record)).toBe(false);
      expect(balanceDeliveryUncertain(record)).toBe(true);
      const unfinished =
        record.finishedAt === null || ['PENDING', 'STORAGE_ERROR'].includes(record.outcome);
      expect(withdrawalBlocksNewExecution(record)).toBe(unfinished);
      expect(canStartAfterUnconfirmedWithdrawal(record)).toBe(!unfinished);
    },
  );
  it.each([
    { responseCode: '10' },
    { responseCode: '00' },
    { correlation: null },
    { finishedAt: null },
    { bytesQueued: 0 },
  ])('rechaza un registro NOT_APPROVED no respaldado %j', async (patch) => {
    const f = await nonApprovedWithdrawal();
    expect(
      parseBalanceJournal({ version: 1, executions: [{ ...f.previous, ...patch }] }),
    ).toBeUndefined();
  });
});

describe('contrato y codificacion de retiro QA', () => {
  it.each(['0.01', '20.00', '9999999999.99'])('acepta monto decimal exacto %s', (amount) => {
    const { request, lease } = withdrawalFixture(amount);
    expect(parseWithdrawalExecutionRequest(request)).toEqual(request);
    expect(parseBalanceExecutionRequest(request)).toBeUndefined();
    const built = new NewVisaWithdrawal().build(lease);
    expect(built.metadata).toMatchObject({
      mti: '0200',
      processingCode: '011000',
      currency: '840',
      amount: amount.replace('.', '').padStart(12, '0'),
    });
    const fields = fixtureFields(built.wire.subarray(4));
    expect(fields.get(3)).toEqual(Buffer.from('011000', 'hex'));
    expect(fields.get(4)).toEqual(Buffer.from(amount.replace('.', '').padStart(12, '0'), 'hex'));
    expect(() => new NewVisaBalance().build(lease)).toThrow();
    expect(() => new CapturedVisaBalance().inspect(built.wire.subarray(4))).toThrow();
  });
  it.each([
    '',
    '0.00',
    '-1.00',
    '20',
    '20,00',
    '020.00',
    '1.001',
    '10000000000.00',
    '1e2',
    20,
    null,
  ])('rechaza monto invalido %s', (amount) => {
    expect(isWithdrawalAmount(amount)).toBe(false);
    const { request } = withdrawalFixture();
    expect(
      parseWithdrawalExecutionRequest({ ...request, draft: { ...request.draft, amount } }),
    ).toBeUndefined();
  });
  it('rechaza secretos, otro escenario/cuenta/ambiente y referencias invalidas', () => {
    const { request } = withdrawalFixture();
    for (const invalid of [
      { ...request, pin: 'PRIVATE' },
      { ...request, wire: [1] },
      { ...request, requestId: 'invalid' },
      ...[
        { environment: 'PROD' },
        { environment: 'PREPROD' },
        { scenario: 'RTC' },
        { account: 'CURRENT' },
        { atmId: null },
        { transaction: 'BALANCE' },
      ].map((patch) => ({ ...request, draft: { ...request.draft, ...patch } })),
    ])
      expect(parseWithdrawalExecutionRequest(invalid)).toBeUndefined();
    expect(parseWithdrawalContextRequest({ ...request })).toBeUndefined();
  });
  it('acepta el caso esperado de rechazo sin forzar la respuesta del host', () => {
    const { request, lease } = withdrawalFixture();
    request.draft.transaction = 'WITHDRAWAL_DECLINED';
    expect(parseWithdrawalExecutionRequest(request)).toEqual(request);
    const built = new NewVisaWithdrawal().build(lease);
    const parsed = new CapturedVisaBalance('WITHDRAWAL').response(
      withdrawalResponse(built.metadata),
    );
    expect(parsed.metadata).toMatchObject({
      mti: '0210',
      processingCode: '011000',
      amount: '0'.repeat(8) + '2000',
      responseCode: '00',
    });
    expect(parsed.metadata.fields).toContain(38);
    expect(parsed.balances).toEqual([
      { accountCode: '10', type: '02', currency: '840', amount: '123.45' },
      { accountCode: '10', type: '01', currency: '840', amount: '234.56' },
    ]);
  });
});

describe('motor de retiro y proteccion de duplicados', () => {
  it('bloquea solo el proveedor pendiente antes de PIN, reserva o transporte', async () => {
    const { request, target } = withdrawalFixture();
    const f = serviceFixture();
    expect(await f.service.execute(request, target, deadlines, async () => true)).toMatchObject({
      ok: true,
      value: {
        outcome: 'BLOCKED',
        frameGenerated: false,
        bytesQueued: 0,
        transmissionAttempted: false,
        withdrawal: { transaction: 'WITHDRAWAL_APPROVED', amount: '20.00', currency: '840' },
        blockers: [
          { id: 'QA-WITHDRAWAL-EMV-GENERATION' },
          { id: 'AMOUNT-RULES' },
          { id: 'QA-WITHDRAWAL-RESULT-RULES' },
        ],
      },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
    expect(f.journal.write).not.toHaveBeenCalled();
  });
  it('guarda PENDING antes del transporte y no repite ni permite cambiar el monto del mismo ID', async () => {
    const { request, target, lease } = withdrawalFixture();
    const acquire = vi.fn(async () => lease);
    const f = serviceFixture({ inspect: async () => ({ ready: true, blockers: [] }), acquire });
    f.transport.exchange.mockImplementation(async () => {
      expect(f.records()[0]).toMatchObject({ outcome: 'PENDING', withdrawal: { amount: '20.00' } });
      return {
        outcome: 'APPROVED',
        transmissionAttempted: true,
        bytesQueued: 548,
        elapsedMs: 20,
        responseCode: '00',
        balances: [],
      };
    });
    const result = await f.service.execute(request, target, deadlines, async () => true);
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'APPROVED', withdrawal: { amount: '20.00' } },
    });
    expect(await f.service.execute(request, target, deadlines, async () => true)).toEqual(result);
    const draft = { ...target.draft, amount: '30.00' };
    expect(
      await f.service.execute(
        { ...request, draft },
        { ...target, draft },
        deadlines,
        async () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(f.transport.exchange).toHaveBeenCalledTimes(1);
    expect(
      [...lease.privateFields.values()].every((bytes) => bytes.every((byte) => byte === 0)),
    ).toBe(true);
  });
  it('rechaza un lease de saldo o de otro monto sin construir ni enviar retiro', async () => {
    for (const amount of [undefined, '30.00']) {
      const { request, target, lease } = withdrawalFixture();
      if (amount === undefined) delete (lease as { amount?: string }).amount;
      else lease.amount = amount;
      const f = serviceFixture({
        inspect: async () => ({ ready: true, blockers: [] }),
        acquire: async () => lease,
      });
      expect(await f.service.execute(request, target, deadlines, async () => true)).toMatchObject({
        ok: true,
        value: { outcome: 'CONTEXT_ERROR', frameGenerated: false },
      });
      expect(f.transport.exchange).not.toHaveBeenCalled();
    }
  });
  it.each([1, 2])('no transmite si se revoca el contrato en revalidacion %i', async (attempt) => {
    const { request, target, lease } = withdrawalFixture();
    let calls = 0;
    const securedLease = {
      ...lease,
      validate: async () => {
        if (++calls === attempt) throw Error('QA_WITHDRAWAL_POLICY_CHANGED');
      },
    };
    const f = serviceFixture({
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: async () => securedLease,
    });
    expect(await f.service.execute(request, target, deadlines, async () => true)).toMatchObject({
      ok: true,
      value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
    expect(
      [...lease.privateFields.values()].every((bytes) => bytes.every((byte) => byte === 0)),
    ).toBe(true);
  });
  it('agota la revalidacion de contrato sin transmitir', async () => {
    const { request, target, lease } = withdrawalFixture();
    const securedLease = { ...lease, validate: () => new Promise<void>(() => undefined) };
    const f = serviceFixture(
      { inspect: async () => ({ ready: true, blockers: [] }), acquire: async () => securedLease },
      10,
    );
    expect(await f.service.execute(request, target, deadlines, async () => true)).toMatchObject({
      ok: true,
      value: {
        outcome: 'CONTEXT_ERROR',
        transmissionAttempted: false,
        blockers: [{ id: 'CONTEXT-TIMEOUT' }],
      },
    });
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('agota el proveedor y destruye una entrega tardia sin transmitir', async () => {
    const { request, target, lease } = withdrawalFixture();
    let resolve!: (value: typeof lease) => void;
    const release = vi.fn();
    lease.release = release;
    const f = serviceFixture(
      {
        inspect: async () => ({ ready: true, blockers: [] }),
        acquire: () =>
          new Promise((done) => {
            resolve = done;
          }),
      },
      10,
    );
    expect(await f.service.execute(request, target, deadlines, async () => true)).toMatchObject({
      ok: true,
      value: { outcome: 'CONTEXT_ERROR', transmissionAttempted: false },
    });
    resolve(lease);
    await new Promise((done) => setTimeout(done, 0));
    expect(release).toHaveBeenCalledTimes(1);
    expect(f.transport.exchange).not.toHaveBeenCalled();
  });
  it('conserva resultado incierto, evita repetirlo y admite una solicitud nueva', async () => {
    const { request, target, lease } = withdrawalFixture();
    const f = serviceFixture({
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: async () => lease,
    });
    f.transport.exchange.mockResolvedValue({
      outcome: 'REQUIRES_REVIEW',
      responseCode: '10',
      transmissionAttempted: true,
      bytesQueued: 548,
      elapsedMs: 20,
      balances: [],
    });
    const result = await f.service.execute(request, target, deadlines, async () => true);
    if (!result.ok) throw Error('TEST_RESULT');
    expect(balanceDeliveryUncertain(result.value)).toBe(true);
    expect(
      balanceDeliveryUncertain({ ...result.value, transmissionAttempted: false, bytesQueued: 0 }),
    ).toBe(true);
    expect(balanceResponseConfirmed(result.value)).toBe(false);
    const markup = renderToStaticMarkup(
      createElement(BalanceExecutionView, { execution: result.value }),
    );
    expect(markup).toContain('Monto solicitado: USD 20.00');
    expect(markup).toContain('Puedes iniciar una nueva transacción QA');
    expect(markup).not.toContain('Consulta aprobada');
    expect(await f.service.execute(request, target, deadlines, async () => true)).toEqual(result);
    expect(f.transport.exchange).toHaveBeenCalledTimes(1);
    const next = withdrawalFixture('100.00');
    const restarted = new WithdrawalService(f.journal, f.transport, runtime, {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: async () => next.lease,
    });
    expect(
      await restarted.execute(next.request, next.target, deadlines, async () => true),
    ).toMatchObject({
      ok: true,
      value: { outcome: 'REQUIRES_REVIEW', withdrawal: { amount: '100.00' } },
    });
    expect(f.transport.exchange).toHaveBeenCalledTimes(2);
    expect(f.records()[0]).toEqual(result.value);
    const file = { version: 1, executions: [result.value] };
    expect(parseBalanceJournal(file)).toEqual([result.value]);
    expect(
      parseBalanceJournal({
        ...file,
        executions: [
          {
            ...result.value,
            withdrawal: { ...result.value.withdrawal, transaction: ['WITHDRAWAL_APPROVED'] },
          },
        ],
      }),
    ).toBeUndefined();
    expect(
      parseBalanceJournal({
        ...file,
        executions: [
          { ...result.value, withdrawal: { ...result.value.withdrawal, pin: 'PRIVATE' } },
        ],
      }),
    ).toBeUndefined();
  });
});
