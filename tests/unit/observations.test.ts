import { describe, expect, it } from 'vitest';
import { parseObservationRequest } from '../../packages/domain/src/observations';
import { decodeResponse } from '../../apps/desktop/src/main/adapters/mediator-observer';
import { observationRequest, observationBatch } from '../helpers/observations';

describe('filtros del observador', () => {
  it('acepta la ventana y filtros del usuario sin convertir la hora SQL', () => {
    expect(parseObservationRequest(observationRequest)).toEqual(observationRequest);
    expect(
      parseObservationRequest({
        ...observationRequest,
        terminalSequence: '006345',
        transactionCode: '003000',
        returnCode: '16',
      }),
    ).toMatchObject({ terminalSequence: '006345' });
  });
  it.each([
    { environment: 'PROD' },
    { from: '2026-02-30 00:00:00.000' },
    { from: '2026-09-29T00:00:07.803Z' },
    { from: '1752-01-01 00:00:00.000' },
    { to: '2026-09-30 00:00:07.804' },
    { to: '2026-09-28 23:00:07.803' },
    { entityId: 32768 },
    { channelId: -1 },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { terminalId: "'; DROP" },
    { terminalId: 'ATM_TOO_LONG' },
    { transactionCode: '00300' },
    { terminalSequence: (1n << 63n).toString() },
    { terminalSequence: '-1' },
    { returnCode: '2147483648' },
    { password: 'private-secret' },
  ])('rechaza entradas inválidas %j', (fields) =>
    expect(parseObservationRequest({ ...observationRequest, ...fields })).toBeUndefined(),
  );
  it('conserva precisión bigint y permite 24 horas inclusivas', () => {
    const request = {
      ...observationRequest,
      terminalSequence: ((1n << 63n) - 1n).toString(),
      to: '2026-09-30 00:00:07.803',
    };
    expect(parseObservationRequest(request)).toEqual(request);
  });
});

describe('respuesta limitada del proceso', () => {
  it('preserva bigint y elimina propiedades inesperadas', () => {
    const batch = observationBatch();
    const row = { ...batch.rows[0], privateField: 'private-secret' };
    expect(
      decodeResponse(JSON.stringify({ ok: true, value: { ...batch, rows: [row] } }), 50),
    ).toEqual({ ok: true, value: batch });
  });
  it.each(['TLS_ERROR', 'TIMEOUT', 'FORBIDDEN', 'SERVICE_UNAVAILABLE'])(
    'traduce %s sin propagar errores del driver',
    (code) => {
      const result = decodeResponse(
        JSON.stringify({ ok: false, code, error: 'private-secret' }),
        50,
      );
      expect(result).toMatchObject({ ok: false, error: { code } });
      expect(JSON.stringify(result)).not.toContain('private-secret');
    },
  );
  it('rechaza datos crudos, atributos libres, IDs numéricos y respuestas excesivas', () => {
    const batch = observationBatch();
    for (const patch of [
      { traceId: 123 },
      { requestStructure: '<HField value="private-secret" />' },
      { responseStructure: '<Data>private-secret</Data>' },
      { terminalId: 'private-secret' },
      { requestStructure: '<Campo>'.repeat(3000) },
    ]) {
      expect(
        decodeResponse(
          JSON.stringify({ ok: true, value: { ...batch, rows: [{ ...batch.rows[0], ...patch }] } }),
          50,
        ),
      ).toMatchObject({ ok: false });
    }
    expect(decodeResponse('private-secret', 50)).toMatchObject({ ok: false });
    expect(decodeResponse(JSON.stringify({ ok: true, value: batch }), 0)).toMatchObject({
      ok: false,
    });
  });
});
