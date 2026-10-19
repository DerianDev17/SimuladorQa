import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { QaVisaReversal } from '../../apps/desktop/src/main/adapters/qa-visa-reversal';
import { NewVisaWithdrawal } from '../../apps/desktop/src/main/adapters/new-visa-withdrawal';
import { parseWithdrawalExecutionRequest } from '../../packages/domain/src/withdrawal';
import { parseWithdrawalReversal } from '../../packages/domain/src/withdrawal-reversal';
import {
  parseBalanceExecutionRequest,
  balanceDeliveryUncertain,
  balanceResponseConfirmed,
} from '../../packages/domain/src/balance-inquiry';
import { parseBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { approvedWithdrawalExecution, withdrawalResponse } from '../helpers/withdrawal';
import {
  reversalFixture,
  reversalFields,
  reversalResponse,
  testEbcdic,
} from '../helpers/withdrawal-reversal';
import {
  createWithdrawalReceipt,
  withdrawalReceiptRows,
} from '../../packages/domain/src/withdrawal-receipt';

describe('reverso total QA con datos del retiro actual', () => {
  it('construye los campos documentados y omite PIN, F7, F23, F53 y F62', () => {
    const f = reversalFixture();
    const built = new NewVisaWithdrawal().build(f.lease);
    const codec = new QaVisaReversal(built.wire);
    const wire = codec.build(withdrawalResponse(built.metadata));
    const fields = reversalFields(wire.subarray(4));
    expect([...fields.keys()]).toEqual([
      2, 3, 4, 11, 12, 13, 14, 15, 18, 19, 22, 25, 28, 32, 35, 37, 38, 39, 41, 42, 43, 48, 49, 55,
      60, 90, 95,
    ]);
    expect(wire.readUInt16BE(26)).toBe(0x0420);
    expect(fields.get(90)).toEqual(
      Buffer.from('0200' + built.metadata.stan + '1008124123' + '0'.repeat(22), 'hex'),
    );
    expect(fields.get(28)).toEqual(testEbcdic('C00000000'));
    expect(fields.get(95)).toEqual(testEbcdic('0'.repeat(42)));
    expect(fields.get(60)).toEqual(Buffer.of(1, 0x22));
    expect(fields.get(38)).toEqual(testEbcdic('123456'));
    expect(fields.get(55)).toEqual(
      Buffer.from('140100119F10070102030405060795058000040000', 'hex'),
    );
    expect(fields.get(48)!.includes(testEbcdic('*F90420200' + built.metadata.stan))).toBe(true);
    expect(fields.get(48)!.includes(testEbcdic('*NL'))).toBe(false);
    expect(codec.response(reversalResponse(wire.subarray(4)))).toBe('00');
    expect(codec.response(reversalResponse(wire.subarray(4), '91'))).toBe('91');
    codec.dispose();
    expect(() => codec.build(withdrawalResponse(built.metadata))).toThrow();
  });
  it.each([11, 37, 41, 90])('no acepta respuesta de otro original (F%s)', (field) => {
    const built = new NewVisaWithdrawal().build(reversalFixture().lease);
    const codec = new QaVisaReversal(built.wire);
    const wire = codec.build(withdrawalResponse(built.metadata));
    expect(
      codec.response(
        reversalResponse(wire.subarray(4), '00', (fields) => {
          fields.get(field)![0] = fields.get(field)![0]! ^ 1;
        }),
      ),
    ).toBeUndefined();
    codec.dispose();
  });
  it('acepta hora F90 normalizada por host, manteniendo instituciones y referencia original', () => {
    const built = new NewVisaWithdrawal().build(reversalFixture().lease);
    const codec = new QaVisaReversal(built.wire);
    const wire = codec.build(withdrawalResponse(built.metadata));
    expect(
      codec.response(
        reversalResponse(wire.subarray(4), '00', (f) => {
          f.get(90)![7] = 0x17;
        }),
      ),
    ).toBe('00');
    expect(
      codec.response(
        reversalResponse(wire.subarray(4), '00', (f) => {
          f.get(90)![11] = 0x01;
        }),
      ),
    ).toBeUndefined();
    codec.dispose();
  });
  it.each(['fee', 'emv', 'private'])('bloquea perfil incompatible antes del retiro: %s', (kind) => {
    const f = reversalFixture();
    const fields = new Map(f.lease.privateFields);
    if (kind === 'fee') fields.set(28, testEbcdic('D00000001'));
    if (kind === 'emv') fields.set(55, Buffer.of(3, 1, 0, 0));
    if (kind === 'private') fields.set(48, Buffer.of(1, 0));
    f.lease.privateFields = fields;
    expect(() => new QaVisaReversal(new NewVisaWithdrawal().build(f.lease).wire)).toThrow();
  });
  it('exige autorización y monto coincidentes; no admite respuesta truncada', () => {
    const built = new NewVisaWithdrawal().build(reversalFixture().lease);
    const codec = new QaVisaReversal(built.wire);
    expect(() => codec.build(withdrawalResponse(built.metadata, '91'))).toThrow();
    expect(() =>
      codec.build(withdrawalResponse(built.metadata, '00', (f) => f.delete(38))),
    ).toThrow();
    expect(() =>
      codec.build(withdrawalResponse(built.metadata, '00', (f) => f.set(4, Buffer.alloc(6)))),
    ).toThrow();
    const wire = codec.build(withdrawalResponse(built.metadata));
    expect(() => codec.response(reversalResponse(wire.subarray(4)).subarray(0, 42))).toThrow();
    codec.dispose();
  });
});
describe('contrato y persistencia del flujo de reverso', () => {
  it.each([0, -1, 31, 1.1, '5', null, undefined])('rechaza espera inválida %s', (delay) => {
    expect(
      parseWithdrawalExecutionRequest({
        ...reversalFixture().request,
        reversalDelaySeconds: delay,
      }),
    ).toBeUndefined();
  });
  it('solo acepta retiro aprobado QA local y no extiende consulta de saldo', () => {
    const f = reversalFixture();
    expect(parseWithdrawalExecutionRequest(f.request)).toEqual(f.request);
    expect(parseBalanceExecutionRequest(f.request)).toBeUndefined();
    expect(
      parseWithdrawalExecutionRequest({
        ...f.request,
        draft: { ...f.request.draft, transaction: 'WITHDRAWAL_DECLINED' },
      }),
    ).toBeUndefined();
  });
  it('conserva dos referencias, mantiene bloqueo hasta 0430/00 y etiqueta comprobante', () => {
    const record = approvedWithdrawalExecution();
    record.reversal = {
      transactionId: randomUUID(),
      delaySeconds: 5,
      outcome: 'WAITING',
      dueAt: '2026-10-19T20:00:05.000Z',
      finishedAt: null,
      responseCode: null,
      transmissionAttempted: false,
      bytesQueued: 0,
    };
    record.finishedAt = null;
    expect(parseBalanceJournal({ version: 1, executions: [record] })).toEqual([record]);
    expect(balanceDeliveryUncertain(record)).toBe(true);
    expect(balanceResponseConfirmed(record)).toBe(false);
    record.reversal = {
      ...record.reversal,
      outcome: 'APPROVED',
      finishedAt: '2026-10-19T20:00:06.000Z',
      responseCode: '00',
      transmissionAttempted: true,
      bytesQueued: 400,
    };
    record.finishedAt = record.reversal.finishedAt;
    expect(parseBalanceJournal({ version: 1, executions: [record] })).toEqual([record]);
    expect(balanceDeliveryUncertain(record)).toBe(false);
    expect(balanceResponseConfirmed(record)).toBe(true);
    expect(withdrawalReceiptRows(createWithdrawalReceipt(record)!)).toContainEqual([
      'Reverso',
      'Reverso aceptado por el host',
    ]);
    expect(parseWithdrawalReversal({ ...record.reversal, raw: 'forbidden' })).toBeUndefined();
    expect(parseWithdrawalReversal({ ...record.reversal, responseCode: '91' })).toBeUndefined();
  });
});
