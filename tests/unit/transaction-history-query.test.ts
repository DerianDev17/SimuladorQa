import { describe, expect, it } from 'vitest';
import { parseTransactionHistoryQuery } from '../../packages/domain/src/transaction-history';
import { randomUUID } from 'node:crypto';

describe('consulta del historial completo', () => {
  it('acepta fechas UTC, referencia pública y cursor estable', () => {
    const query = {
      environment: 'QA',
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-20T00:00:00.000Z',
      operation: 'DEPOSIT',
      reference: ' 000123 ',
      before: { startedAt: '2026-11-19T00:00:00.000Z', requestId: randomUUID() },
    };
    expect(parseTransactionHistoryQuery(query)).toEqual({ ...query, reference: '000123' });
  });
  it.each([
    null,
    {},
    { environment: 'PROD' },
    { environment: 'QA', limit: 100000 },
    { environment: 'QA', from: 'yesterday' },
    { environment: 'QA', from: '2026-11-20T00:00:00.000Z', to: '2026-11-19T00:00:00.000Z' },
    { environment: 'QA', reference: "' OR 1=1" },
    { environment: 'QA', reference: 'a'.repeat(121) },
    { environment: 'QA', operation: 'UNKNOWN' },
    { environment: 'QA', before: { requestId: '../private' } },
  ])('rechaza entradas inválidas y campos desconocidos: %j', (query) => {
    expect(parseTransactionHistoryQuery(query)).toBeNull();
  });
});
