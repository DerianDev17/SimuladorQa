import type { loadRunEvidence } from './load-export';

// Only the public evidence projection may reach this presentation function.
type Evidence = ReturnType<typeof loadRunEvidence>;
function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? 'Sin dato')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function fields(entries: [string, string | number | null | undefined][]): string {
  return entries
    .map(
      ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join('');
}
function decimal(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}
const styles = `
:root { color-scheme: light; font-family: system-ui, sans-serif; color: #172b42; background: #eef2f6; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px; }
main { max-width: 1200px; margin: auto; }
header, section { background: white; padding: 24px; margin-bottom: 20px; border: 1px solid #ccd6e2; border-radius: 12px; }
header { border-top: 6px solid #126c67; }
h1 { margin: 8px 0 16px; font-size: 28px; }
h2 { margin: 0 0 16px; font-size: 20px; }
p { line-height: 1.6; }
.eyebrow { color: #126c67; font-weight: 700; letter-spacing: .08em; }
.notice { background: #fff4d9; border-left: 4px solid #956300; padding: 12px 16px; }
dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px; margin: 0; }
dt { font-size: 13px; color: #495d73; margin-bottom: 6px; }
dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.metrics dd { font-size: 24px; font-weight: 650; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 12px; table-layout: fixed; min-width: 780px; }
caption { text-align: left; padding-bottom: 12px; color: #495d73; }
th, td { text-align: left; vertical-align: top; border-bottom: 1px solid #ccd6e2; padding: 10px 8px; overflow-wrap: anywhere; }
thead { background: #edf4f4; }
td dl { display: block; }
td dl div { margin-bottom: 8px; }
td dt { font-size: 11px; }
footer { color: #495d73; font-size: 12px; padding: 0 8px; }
@media (max-width: 600px) { body { padding: 12px; } header, section { padding: 16px; } }
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  :root { background: white; }
  body { padding: 0; }
  header, section { border-radius: 0; padding: 12px; }
  .table-wrap { overflow: visible; }
  table { min-width: 0; font-size: 10px; }
  thead { display: table-header-group; }
  tr, dl > div { break-inside: avoid; }
  h2 { break-after: avoid; }
}
`;

export function renderLoadHtml(evidence: Evidence): string {
  const { run } = evidence;
  const { plan, metrics } = run;
  const rows = run.operations
    .map(
      (item, index) => `<tr><th scope="row">${index + 1}</th>
<td><dl>${fields([
        ['Transacción', item.transactionId],
        ['Solicitud', item.requestId],
      ])}</dl></td>
<td><dl>${fields([
        ['ATM', item.atmId],
        ['Terminal', item.correlation?.terminalId],
      ])}</dl></td>
<td><dl>${fields([
        ['Resultado registrado', item.outcome],
        ['Enviado', item.sent ? 'Sí' : 'No'],
        ['Respuesta recibida', item.received ? 'Sí' : 'No'],
        ['Cancelación local', item.cancelled ? 'Sí' : 'No'],
      ])}</dl></td>
<td><dl>${fields([
        ['Código de respuesta', item.responseCode],
        ['STAN', item.correlation?.stan],
        ['RRN', item.correlation?.rrn],
      ])}</dl></td>
<td><dl>${fields([
        ['Fin (UTC)', item.finishedAt],
        ['Transporte (ms)', item.elapsedMs],
      ])}</dl></td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Informe de carga · ${escapeHtml(run.runId)}</title>
<style>${styles}</style>
</head>
<body><main>
<header><p class="eyebrow">COONECTA · EVIDENCIA LOCAL QA</p>
<h1>Informe de carga y estrés</h1>
<p class="notice">${escapeHtml(evidence.notice)}</p>
<dl>${fields([
    ['Corrida (runId)', run.runId],
    ['Solicitud de corrida', run.requestId],
    ['Estado registrado', run.state],
    ['Inicio (UTC)', run.startedAt],
    ['Fin (UTC)', run.finishedAt],
    ['Duración total (ms)', run.elapsedMs],
    ['Exportado (UTC)', evidence.exportedAt],
  ])}</dl></header>
<section aria-labelledby="results"><h2 id="results">Resultados de ejecución</h2>
<dl class="metrics">${fields([
    ['Operaciones registradas', run.operations.length],
    ['Enviadas', metrics.sent],
    ['Respuestas recibidas', metrics.received],
    ['Aprobadas', metrics.approved],
    ['Rechazadas', metrics.declined],
    ['Timeouts', metrics.timeouts],
    ['Errores (incluye timeouts)', metrics.errors],
    ['Canceladas', metrics.cancelled],
    ['Enviadas sin respuesta', metrics.unconfirmed],
    ['TPS observado', decimal(metrics.tps)],
    ['TPS objetivo', plan.targetTps],
  ])}</dl>
<p>Los contadores no son categorías excluyentes. TPS observado = envíos / tiempo total,
incluida preparación y cierre. El objetivo y la finalización no acreditan capacidad del host;
en estrés el objetivo corresponde al pico de la rampa.</p></section>
<section aria-labelledby="latency"><h2 id="latency">Latencia de respuestas (ms)</h2>
<dl>${fields([
    ['Mínima', decimal(metrics.min)],
    ['Promedio', decimal(metrics.avg)],
    ['Máxima', decimal(metrics.max)],
    ['p50', decimal(metrics.p50)],
    ['p90', decimal(metrics.p90)],
    ['p95', decimal(metrics.p95)],
    ['p99', decimal(metrics.p99)],
  ])}</dl><p>Solo respuestas recibidas. Sin respuestas, la latencia se muestra como «Sin dato».</p></section>
<section aria-labelledby="plan"><h2 id="plan">Configuración de la corrida</h2>
<dl>${fields([
    ['Ambiente', plan.environment],
    ['Operación', plan.operation === 'WITHDRAWAL' ? 'Retiro' : 'Consulta de saldo'],
    ['Modo', plan.mode],
    ['Monto por retiro', plan.amount === null ? 'No aplica' : `${plan.currency} ${plan.amount}`],
    ['Concurrencia', plan.concurrency],
    ['Máximo de operaciones', plan.maxTransactions],
    ['Duración máxima (s)', plan.durationSeconds],
    ['Rampa (s)', plan.rampUpSeconds],
    ...plan.atms.map((atm, index): [string, string] => [
      `ATM ${index + 1} · revisión ${atm.atmRevision}`,
      atm.atmId,
    ]),
  ])}</dl></section>
<section aria-labelledby="operations"><h2 id="operations">Detalle por operación</h2>
<p>Identificadores y resultados conservados tal como fueron registrados. «Sin dato» indica
información ausente; no se infiere un ATM cuando un registro antiguo tiene varios perfiles.</p>
${
  rows
    ? `<div class="table-wrap"><table><caption>${run.operations.length} ${run.operations.length === 1 ? 'operación' : 'operaciones'} · fechas UTC</caption>
<colgroup><col style="width:4%"><col style="width:25%"><col style="width:22%"><col style="width:17%"><col style="width:15%"><col style="width:17%"></colgroup>
<thead><tr><th scope="col">N.º</th><th scope="col">Identificadores</th><th scope="col">ATM / Terminal</th><th scope="col">Resultado</th><th scope="col">Correlación</th><th scope="col">Tiempo</th></tr></thead>
<tbody>${rows}</tbody></table></div>`
    : '<p>No hay operaciones registradas en esta corrida.</p>'
}
</section>
<footer><p>Evidencia ${escapeHtml(evidence.evidence)} · esquema ${evidence.schemaVersion}.
Archivo local sin conexiones externas. Para imprimir o guardar como PDF, usa la opción
Imprimir del navegador. CSV/JSON conservan los valores numéricos sin redondeo de presentación.</p></footer>
</main></body></html>
`;
}
