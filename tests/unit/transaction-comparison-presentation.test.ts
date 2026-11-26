import { describe, expect, it } from 'vitest';
import {
  filterComparisonRows,
  formatComparisonValue,
  summarizeComparisonRows,
} from '../../apps/desktop/src/renderer/transaction-comparison-presentation';
import type { MessageComparisonRow } from '../../packages/domain/src/iso-message-comparison';

const rows: MessageComparisonRow[] = [
  {
    id: 'F39',
    label: 'Código de respuesta',
    reference: '00',
    current: '96',
    status: 'changed',
    variable: false,
  },
  {
    id: 'F55/9F26',
    label: 'Tag EMV',
    reference: 'hidden-test-value',
    current: 'hidden-test-value',
    status: 'unverifiable',
    variable: false,
  },
  {
    id: 'MTI',
    label: 'Tipo de mensaje',
    reference: '0210',
    current: '0210',
    status: 'equal',
    variable: false,
  },
];
describe('presentación del comparador', () => {
  it('busca números, tags y descripciones sin acentos o mayúsculas', () => {
    expect(filterComparisonRows(rows, '  CODIGO  ', true).map((row) => row.id)).toEqual(['F39']);
    expect(filterComparisonRows(rows, '9f26', true).map((row) => row.id)).toEqual(['F55/9F26']);
    expect(filterComparisonRows(rows, '39', false).map((row) => row.id)).toEqual(['F39']);
    expect(filterComparisonRows(rows, 'mti', true)).toEqual([]);
    expect(filterComparisonRows(rows, 'mti', false)).toEqual([rows[2]]);
    expect(filterComparisonRows(rows, '   ', false)).toEqual(rows);
  });
  it('no busca valores completos o protegidos y distingue búsqueda sin coincidencias', () => {
    expect(filterComparisonRows(rows, 'hidden-test-value', false)).toEqual([]);
    expect(filterComparisonRows(rows, '96', false)).toEqual([]);
    expect(filterComparisonRows(rows, 'inexistente', false)).toEqual([]);
  });
  it('resume las filas completas sin convertir incertidumbre en igualdad ni depender del filtro', () => {
    const allRows: MessageComparisonRow[] = [
      ...rows,
      { ...rows[0]!, id: 'F41', status: 'added' },
      { ...rows[0]!, id: 'F42', status: 'removed' },
    ];
    const before = structuredClone(allRows);
    expect(summarizeComparisonRows(allRows)).toEqual({
      equal: 1,
      changed: 1,
      added: 1,
      removed: 1,
      unverifiable: 1,
    });
    filterComparisonRows(allRows, 'mti', true);
    expect(allRows).toEqual(before);
    expect(summarizeComparisonRows([])).toEqual({
      equal: 0,
      changed: 0,
      added: 0,
      removed: 0,
      unverifiable: 0,
    });
  });
  it('distingue dato ausente, vacío y espacios sin recortar valores', () => {
    expect(formatComparisonValue(undefined)).toBe('No disponible');
    expect(formatComparisonValue('')).toBe('Vacío');
    expect(formatComparisonValue('   ')).toBe('Solo espacios en blanco (3 caracteres)');
    expect(formatComparisonValue(' TEST ')).toBe(' TEST ');
    expect(formatComparisonValue('••••••••')).toBe('••••••••');
  });
});
