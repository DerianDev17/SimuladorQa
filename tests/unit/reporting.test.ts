import { describe, expect, it } from 'vitest';
import {
  emptyReportingFilters,
  filterAudit,
  matchesReport,
  reportingAudit,
  validReportingFilters,
} from '../../apps/desktop/src/renderer/reporting';
import { validLoadConfigurationAudit } from '../../packages/domain/src/load-configurations';

const id = '00000000-0000-4000-8000-00000000000a';
const other = '00000000-0000-4000-8000-00000000000b';
const timestamp = '2026-11-13T15:00:00.000Z';
const actor = { id, timestamp, user: 'qa', machine: 'station' };
describe('reportería y auditoría central', () => {
  it('combina fuentes sin perder eventos con el mismo ID ni inventar detalles históricos', () => {
    const entries = reportingAudit({
      catalog: [
        { ...actor, environment: 'QA', resource: 'ATM', recordId: other, action: 'CREATED' },
      ],
      send: [{ ...actor, environment: 'QA', configurationId: other, revision: 2 }],
      load: [{ ...actor, configurationId: other, revision: 3, action: 'DELETED' }],
    });
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((item) => item.key)).size).toBe(3);
    expect(entries.find((item) => item.origin === 'send')?.details).toEqual([
      'Detalle no disponible en este registro anterior',
    ]);
    expect(entries.find((item) => item.origin === 'load')).toMatchObject({
      action: 'Eliminación',
      recordId: other,
    });
    expect(filterAudit(entries, { ...emptyReportingFilters, atmId: other })).toHaveLength(1);
    expect(
      filterAudit(entries, { ...emptyReportingFilters, query: 'configuracion de envio' }),
    ).toHaveLength(1);
  });
  it('aplica intervalo inclusivo/exclusivo, origen y ATM sin atribuir eventos sin vínculo', () => {
    const item = { timestamp, origin: 'load' as const, atms: [id, other], text: 'Carga de saldo' };
    const filters = {
      ...emptyReportingFilters,
      from: timestamp,
      to: '2026-11-13T16:00:00.000Z',
      atmId: other,
    };
    expect(matchesReport(filters, item)).toBe(true);
    expect(matchesReport({ ...filters, to: timestamp }, item)).toBe(false);
    expect(matchesReport({ ...filters, origin: 'ATM' }, item)).toBe(false);
    expect(matchesReport(filters, { ...item, atms: [] })).toBe(false);
    expect(matchesReport({ ...filters, query: 'retiro' }, item)).toBe(false);
  });
  it('rechaza filtros inválidos y conserva filtros vacíos válidos', () => {
    expect(validReportingFilters(emptyReportingFilters)).toBe(true);
    for (const change of [
      { from: 'bad' },
      { from: timestamp, to: timestamp },
      { origin: 'unknown' },
      { atmId: '../private' },
      { query: 'a'.repeat(121) },
    ])
      expect(validReportingFilters({ ...emptyReportingFilters, ...change })).toBe(false);
  });
  it('valida la proyección pública de auditoría de carga, sin aceptar columnas extra', () => {
    const item = { ...actor, configurationId: other, revision: 1, action: 'CREATED' };
    expect(validLoadConfigurationAudit(item)).toBe(true);
    for (const change of [
      { payload: 'private' },
      { id: 'invalid' },
      { timestamp: 'invalid' },
      { revision: 0 },
      { action: 'UNKNOWN' },
      { user: '' },
    ])
      expect(validLoadConfigurationAudit({ ...item, ...change })).toBe(false);
  });
});
