import { describe, it, expect } from 'vitest';
import { parseLoadHistoryQuery, parseLoadHistoryId } from '../../packages/domain/src/load-history';
import { historyRun } from '../helpers/load-history';

describe('contratos de consulta de carga', () => {
  it('acepta filtros públicos y copia la consulta', () => {
    const query = {
      operation: 'WITHDRAWAL',
      state: 'FAILED',
      from: '2026-11-02T00:00:00.000Z',
      to: '2026-11-03T00:00:00.000Z',
      atmId: historyRun().draft.atmId,
      before: 21,
    };
    expect(parseLoadHistoryQuery(query)).toEqual(query);
    expect(parseLoadHistoryQuery(query)).not.toBe(query);
    expect(parseLoadHistoryQuery({})).toEqual({});
  });
  it.each([
    null,
    [],
    { environment: 'PROD' },
    { amount: '20.00' },
    { from: '2026-02-30' },
    { from: '2026-11-03T00:00:00.000Z', to: '2026-11-02T00:00:00.000Z' },
    { operation: 'REVERSAL' },
    { state: 'toString' },
    { atmId: "' OR 1=1" },
    { before: -1 },
    { before: 1.1 },
    { before: Infinity },
  ])('rechaza entrada inválida %j', (value) => {
    expect(parseLoadHistoryQuery(value)).toBeUndefined();
  });
  it('solo permite un UUID para detalle', () => {
    const runId = historyRun().runId;
    expect(parseLoadHistoryId({ runId })).toBe(runId);
    expect(parseLoadHistoryId({ runId, file: 'private' })).toBeUndefined();
    expect(parseLoadHistoryId({ runId: '../private' })).toBeUndefined();
  });
});
