// Shared text-only formatting for both report audiences.
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? 'Sin dato')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
export function fields(entries: [string, string | number | null | undefined][]): string {
  return entries
    .map(
      ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('');
}
export function decimal(value: number | null): string | null {
  return value === null ? null : value > 0 && value < 0.01 ? '<0.01' : value.toFixed(2);
}
