import { describe, expect, it } from 'vitest';
import {
  parseBalanceContextRequest,
  parseBalanceExecutionRequest,
  type BalanceContextRequest,
} from '../../packages/domain/src/balance-inquiry';
import {
  parseWithdrawalContextRequest,
  parseWithdrawalExecutionRequest,
} from '../../packages/domain/src/withdrawal';
import {
  parseDepositContextRequest,
  parseDepositExecutionRequest,
} from '../../packages/domain/src/deposit';
import { balanceRequest, balanceTarget } from '../helpers/balance-inquiry';

const operations = [
  {
    transaction: 'BALANCE',
    context: parseBalanceContextRequest,
    execute: parseBalanceExecutionRequest,
  },
  {
    transaction: 'WITHDRAWAL_APPROVED',
    context: parseWithdrawalContextRequest,
    execute: parseWithdrawalExecutionRequest,
  },
  {
    transaction: 'WITHDRAWAL_DECLINED',
    context: parseWithdrawalContextRequest,
    execute: parseWithdrawalExecutionRequest,
  },
  {
    transaction: 'DEPOSIT',
    context: parseDepositContextRequest,
    execute: parseDepositExecutionRequest,
  },
] as const;

describe.each(operations)('contexto financiero público de $transaction', (operation) => {
  function fixture() {
    const request = balanceRequest(balanceTarget());
    request.draft.transaction = operation.transaction;
    request.draft.amount = operation.transaction === 'BALANCE' ? null : '75.25';
    const { requestId, ...context } = request;
    return { request, requestId, context };
  }

  it('conserva el contrato y reconstruye el borrador sin modificar la entrada', () => {
    const { request, context } = fixture();
    const before = structuredClone(request);
    const parsed = operation.context(context);
    expect(parsed).toEqual(context);
    expect(parsed?.draft).not.toBe(context.draft);
    expect(operation.execute(request)).toEqual(request);
    expect(request).toEqual(before);
  });

  it.each([null, undefined, [], 'invalid', 1])(
    'rechaza entradas que no son solicitudes: %j',
    (value) => {
      expect(operation.context(value)).toBeUndefined();
      expect(operation.execute(value)).toBeUndefined();
    },
  );

  it.each([
    { cardReadId: null },
    { cardReadId: 'invalid' },
    { configurationRevision: 0 },
    { configurationRevision: 1.5 },
    { configurationRevision: '1' },
    { extra: true },
    { draft: null },
  ])('rechaza identificadores, revisiones y estructura inválidos: %j', (change) => {
    const { context, requestId } = fixture();
    const invalid = { ...context, ...change };
    expect(operation.context(invalid)).toBeUndefined();
    expect(operation.execute({ ...invalid, requestId })).toBeUndefined();
  });

  it.each(['draft', 'cardReadId', 'configurationRevision'] as const)(
    'exige %s, incluso al reemplazarlo por otra clave',
    (key) => {
      const { context, requestId } = fixture();
      const invalid: Partial<BalanceContextRequest> & { extra?: boolean } = { ...context };
      delete invalid[key];
      for (const payload of [invalid, { ...invalid, extra: true }]) {
        expect(operation.context(payload)).toBeUndefined();
        expect(operation.execute({ ...payload, requestId })).toBeUndefined();
      }
    },
  );

  it.each([
    { environment: 'PROD' },
    { environment: 'PREPROD' },
    { account: 'CURRENT' },
    { account: null },
    { atmId: null, atmRevision: null },
    { atmId: 'invalid' },
    { atmRevision: 0 },
    { atmRevision: 1.5 },
    { extra: true },
  ])('rechaza un borrador fuera del contexto común: %j', (change) => {
    const { context, requestId } = fixture();
    const invalid = { ...context, draft: { ...context.draft, ...change } };
    expect(operation.context(invalid)).toBeUndefined();
    expect(operation.execute({ ...invalid, requestId })).toBeUndefined();
  });

  it('no mezcla contexto, identificador de ejecución ni reverso', () => {
    const { context, request, requestId } = fixture();
    expect(operation.context(request)).toBeUndefined();
    expect(operation.execute(context)).toBeUndefined();
    expect(operation.execute({ ...request, requestId: 'invalid' })).toBeUndefined();
    expect(operation.context({ ...context, reversalDelaySeconds: 1 })).toBeUndefined();
    const reversal = { ...request, reversalDelaySeconds: 1 };
    if (operation.transaction === 'WITHDRAWAL_APPROVED')
      expect(operation.execute(reversal)).toEqual(reversal);
    else expect(operation.execute(reversal)).toBeUndefined();
    expect(operation.execute({ ...context, requestId, extra: true })).toBeUndefined();
  });

  it('conserva las restricciones de escenario de cada operación', () => {
    const { context, requestId } = fixture();
    const otherScenario = { ...context, draft: { ...context.draft, scenario: 'BANRED' } };
    // Parsing a balance context has never authorized the route. Main validates
    // the destination/provider; withdrawal and deposit require LOCAL here.
    if (operation.transaction === 'BALANCE') {
      expect(operation.context(otherScenario)).toEqual(otherScenario);
      expect(operation.execute({ ...otherScenario, requestId })).toEqual({
        ...otherScenario,
        requestId,
      });
    } else {
      expect(operation.context(otherScenario)).toBeUndefined();
      expect(operation.execute({ ...otherScenario, requestId })).toBeUndefined();
    }
  });

  it('rechaza solicitudes válidas de otra operación', () => {
    const { context, requestId } = fixture();
    const transaction = operation.transaction === 'BALANCE' ? 'DEPOSIT' : 'BALANCE';
    const different = {
      ...context,
      draft: { ...context.draft, transaction, amount: transaction === 'BALANCE' ? null : '75.25' },
    };
    expect(operation.context(different)).toBeUndefined();
    expect(operation.execute({ ...different, requestId })).toBeUndefined();
  });
});
