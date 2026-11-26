import type {
  ComparisonStatus,
  MessageComparisonRow,
} from '../../../../packages/domain/src/iso-message-comparison';

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Search metadata only: matching must not disclose masked or hidden values.
export function filterComparisonRows(
  rows: readonly MessageComparisonRow[],
  query: string,
  onlyDifferences: boolean,
): MessageComparisonRow[] {
  const search = normalized(query);
  return rows.filter(
    (row) =>
      (!onlyDifferences || row.status !== 'equal') &&
      normalized(`${row.id} ${row.label}`).includes(search),
  );
}

export function summarizeComparisonRows(
  rows: readonly MessageComparisonRow[],
): Record<ComparisonStatus, number> {
  const counts = { equal: 0, changed: 0, added: 0, removed: 0, unverifiable: 0 };
  for (const row of rows) counts[row.status]++;
  return counts;
}

export function formatComparisonValue(value: string | undefined): string {
  if (value === undefined) return 'No disponible';
  if (value === '') return 'Vacío';
  if (/^\s+$/.test(value)) return `Solo espacios en blanco (${value.length} caracteres)`;
  return value;
}
