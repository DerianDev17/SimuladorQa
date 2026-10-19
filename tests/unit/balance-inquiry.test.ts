import { describe, expect, it } from 'vitest';
import {
  parseBalanceContextRequest,
  parseBalanceExecutionRequest,
  balanceDeliveryUncertain,
  balanceNotTransmitted,
  canStartAfterUnconfirmedBalance,
} from '../../packages/domain/src/balance-inquiry';
import type { BalanceExecution, BalanceOutcome } from '../../packages/domain/src/balance-inquiry';
import {
  balanceDynamicFields,
  parseBalanceValues,
} from '../../apps/desktop/src/main/adapters/coonecta-balance-rules';
import { NewVisaBalance } from '../../apps/desktop/src/main/adapters/new-visa-balance';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import {
  balanceLease,
  balanceRequest,
  balanceResponse,
  balanceTarget,
} from '../helpers/balance-inquiry';

describe('reintento explícito según entrega financiera', () => {
  const result = (outcome: BalanceOutcome, transmissionAttempted = false): BalanceExecution => ({
    ...balanceRequest(balanceTarget()),
    environment: 'QA',
    atmId: 'synthetic',
    atmRevision: 1,
    scenario: 'LOCAL',
    runId: 'synthetic',
    transactionId: 'synthetic',
    startedAt: '2026-10-14T00:00:00.000Z',
    finishedAt: '2026-10-14T00:00:01.000Z',
    outcome,
    frameGenerated: true,
    transmissionAttempted,
    bytesQueued: transmissionAttempted ? 536 : 0,
    elapsedMs: 0,
    correlation: null,
    responseCode: null,
    balances: [],
    blockers: [],
  });
  it.each([
    'BLOCKED',
    'CONTEXT_ERROR',
    'CONNECT_TIMEOUT',
    'PEER_CLOSED',
    'TRANSPORT_ERROR',
  ] as const)('permite un nuevo intento después de %s confirmado sin transmisión', (outcome) => {
    expect(balanceNotTransmitted(result(outcome))).toBe(true);
    expect(balanceNotTransmitted({ ...result(outcome), bytesQueued: 1 })).toBe(false);
    expect(balanceDeliveryUncertain({ ...result(outcome), bytesQueued: 1 })).toBe(true);
    expect(balanceNotTransmitted({ ...result(outcome), finishedAt: null })).toBe(false);
  });
  it.each([
    'PENDING',
    'STORAGE_ERROR',
    'RESPONSE_TIMEOUT',
    'INVALID_RESPONSE',
    'PEER_CLOSED',
    'TRANSPORT_ERROR',
  ] as const)('conserva la referencia de %s con entrega desconocida', (outcome) => {
    expect(balanceDeliveryUncertain(result(outcome, true))).toBe(true);
    expect(balanceNotTransmitted(result(outcome, true))).toBe(false);
  });
  it.each(['APPROVED', 'NOT_APPROVED'] as const)(
    'permite preparar otra operación tras %s',
    (outcome) => {
      expect(balanceDeliveryUncertain(result(outcome, true))).toBe(false);
      expect(balanceNotTransmitted(result(outcome, true))).toBe(false);
    },
  );
  it.each(['PEER_CLOSED', 'RESPONSE_TIMEOUT', 'TRANSPORT_ERROR', 'INVALID_RESPONSE'] as const)(
    'permite otra operación tras consulta terminada %s conservando su incertidumbre',
    (outcome) => {
      const execution = result(outcome, true);
      expect(canStartAfterUnconfirmedBalance(execution)).toBe(true);
      expect(balanceDeliveryUncertain(execution)).toBe(true);
      expect(balanceNotTransmitted(execution)).toBe(false);
      expect(canStartAfterUnconfirmedBalance({ ...execution, finishedAt: null })).toBe(false);
      expect(
        canStartAfterUnconfirmedBalance({
          ...execution,
          withdrawal: {
            transaction: 'WITHDRAWAL_APPROVED',
            amount: '50.00',
            account: 'SAVINGS',
            currency: '840',
          },
        }),
      ).toBe(false);
    },
  );
  it.each(['PENDING', 'STORAGE_ERROR', 'REQUIRES_REVIEW'] as const)(
    'no libera el formulario sin ejecución de saldo terminada y guardada: %s',
    (outcome) => expect(canStartAfterUnconfirmedBalance(result(outcome, true))).toBe(false),
  );
});

describe('reglas de consulta CB provenientes del módulo ATM', () => {
  it('construye campos nuevos y F37 según el calendario explícito del host', () => {
    const lease = balanceLease(balanceTarget());
    const fields = balanceDynamicFields(lease);
    expect(fields.get(3)).toBe('301000');
    expect(fields.get(7)).toBe('1008124123');
    expect(fields.get(11)).toBe('007923');
    expect(fields.get(37)).toBe('6' + '281' + String(7923).padStart(8, '0'));
    expect(fields.get(15)).toBe('1008');
    const current = balanceDynamicFields({
      ...lease,
      account: 'CURRENT',
      local: { ...lease.local, year: 2024, month: 2, day: 29 },
    });
    expect(current.get(3)).toBe('302000');
    expect(current.get(37)!.slice(0, 4)).toBe('4060');
  });
  it.each([0, 1000000, 1.2, NaN])('rechaza secuencia fuera de contrato %s', (sequence) => {
    expect(() => balanceDynamicFields({ ...balanceLease(balanceTarget()), sequence })).toThrow(
      'BALANCE_DYNAMIC_INPUT_INVALID',
    );
  });
  it('rechaza calendario inválido y no completa fechas o terminal por defecto', () => {
    const lease = balanceLease(balanceTarget());
    expect(() =>
      balanceDynamicFields({ ...lease, local: { ...lease.local, month: 2, day: 30 } }),
    ).toThrow('BALANCE_CALENDAR_INVALID');
    expect(() => balanceDynamicFields({ ...lease, terminalId: 'long-terminal' })).toThrow(
      'BALANCE_DYNAMIC_INPUT_INVALID',
    );
  });
  it('arma el perfil observado sin mutar los buffers privados ni aceptar otro perfil', () => {
    const lease = balanceLease(balanceTarget());
    const before = Buffer.from(lease.privateFields.get(52)!);
    const built = new NewVisaBalance().build(lease);
    expect(built.metadata).toMatchObject({
      mti: '0200',
      processingCode: '301000',
      stan: '007923',
      currency: '840',
      terminalId: 'ATM20521',
    });
    expect(lease.privateFields.get(52)).toEqual(before);
    expect(built.wire.readUInt16BE(0)).toBe(built.wire.length - 4);
    expect(() => new NewVisaBalance().build({ ...lease, account: 'CURRENT' })).toThrow(
      'BALANCE_PROFILE_INVALID',
    );
    expect(() => new NewVisaBalance().build({ ...lease, privateFields: new Map() })).toThrow(
      'BALANCE_PROFILE_INVALID',
    );
  });
  it('valida IPC por referencia de tarjeta y rechaza secretos, bytes, PROD y retiros', () => {
    const target = balanceTarget();
    const request = balanceRequest(target);
    expect(parseBalanceExecutionRequest(request)).toEqual(request);
    expect(
      parseBalanceContextRequest({
        draft: target.draft,
        configurationRevision: 1,
        cardReadId: target.cardReadId,
      }),
    ).toBeDefined();
    for (const bad of [
      { ...request, pin: 'private' },
      { ...request, wireBytes: [1] },
      { ...request, requestId: 'invalid' },
      { ...request, draft: { ...request.draft, environment: 'PROD' } },
      { ...request, draft: { ...request.draft, account: 'CURRENT' } },
      {
        ...request,
        draft: { ...request.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' },
      },
    ])
      expect(parseBalanceExecutionRequest(bad)).toBeUndefined();
  });
});
describe('saldo F54 exacto, sin asignar significado de tipos por suposición', () => {
  const record = (type = '02', sign = 'C', minor = 12345) =>
    '10' + type + '840' + sign + String(minor).padStart(12, '0');
  it('interpreta orden de registros, centavos, crédito/débito y cero sin floats', () => {
    expect(parseBalanceValues(record() + record('01', 'D', 1))).toEqual([
      { accountCode: '10', type: '02', currency: '840', amount: '123.45' },
      { accountCode: '10', type: '01', currency: '840', amount: '-0.01' },
    ]);
    expect(parseBalanceValues(record('91', 'D', 0))[0]!.amount).toBe('0.00');
  });
  it.each(['', record().slice(1), record('03'), record('02', 'X'), record() + record()])(
    'rechaza dato ambiguo o no soportado',
    (text) => expect(() => parseBalanceValues(text)).toThrow(),
  );
  it('extrae saldos solamente de respuestas aprobadas y comprueba cuenta/moneda', () => {
    const built = new NewVisaBalance().build(balanceLease(balanceTarget()));
    const codec = new CapturedVisaBalance();
    expect(codec.response(balanceResponse(built.metadata)).balances.map((x) => x.amount)).toEqual([
      '123.45',
      '234.56',
    ]);
    expect(codec.response(balanceResponse(built.metadata, '91')).balances).toEqual([]);
    expect(() =>
      codec.response(balanceResponse(built.metadata, '00', (fields) => fields.delete(54))),
    ).toThrow('BALANCE_VALUES_MISSING');
    expect(() =>
      codec.response(
        balanceResponse(built.metadata, '00', (fields) => {
          fields.get(54)![1] = 0xf2;
        }),
      ),
    ).toThrow('BALANCE_VALUES_PROFILE_MISMATCH');
  });
});
