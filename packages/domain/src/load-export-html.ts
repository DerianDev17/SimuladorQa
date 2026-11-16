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
  return value === null ? null : value > 0 && value < 0.01 ? '<0.01' : value.toFixed(2);
}
function barChart(
  title: string,
  unit: string,
  values: readonly [string, number | null][],
  note: string,
): string {
  const maximum = Math.max(0, ...values.map(([, value]) => value ?? 0));
  const rows = values.map(([label, value], index) => {
    const width = value === null || maximum === 0 ? 0 : (value / maximum) * 100;
    return `<li><div class="bar-label"><span>${escapeHtml(label)}</span><strong>${escapeHtml(decimal(value))}${value === null ? '' : ` ${escapeHtml(unit)}`}</strong></div>
<div class="bar-track" aria-hidden="true"><span class="bar-fill bar-${unit === 'ms' ? 0 : index % 2}" style="width:${width.toFixed(4)}%"></span></div></li>`;
  });
  return `<figure class="chart"><figcaption>${escapeHtml(title)}</figcaption>
<ul aria-label="${escapeHtml(title)}">${rows.join('')}</ul>
${maximum > 0 ? `<div class="chart-axis" aria-hidden="true"><span>0</span><span>${escapeHtml(decimal(maximum))} ${escapeHtml(unit)}</span></div>` : ''}
<p class="chart-note">${escapeHtml(note)}</p></figure>`;
}

function visualSummary(evidence: Evidence): string {
  const { metrics, plan } = evidence.run;
  return `<div class="charts">${barChart(
    'TPS observado y objetivo',
    'TPS',
    [
      ['Observado · promedio total', metrics.tps],
      [
        plan.mode === 'STRESS' ? 'Objetivo · pico de rampa' : 'Objetivo configurado',
        plan.targetTps,
      ],
    ],
    'Escala común desde cero. La comparación no certifica capacidad ni cumplimiento sostenido.',
  )}${barChart(
    'Percentiles de latencia',
    'ms',
    [
      ['p50', metrics.p50],
      ['p90', metrics.p90],
      ['p95', metrics.p95],
      ['p99', metrics.p99],
    ],
    metrics.received === 0
      ? 'Sin respuestas recibidas: no hay muestras de latencia.'
      : `${metrics.received} ${metrics.received === 1 ? 'respuesta recibida' : 'respuestas recibidas'}. Escala común desde cero; no incluye timeouts sin respuesta.`,
  )}</div>`;
}
const styles = `
:root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; color: #203348; background: #e9eef3; font-size: 14px; }
* { box-sizing: border-box; }
body { margin: 0; padding: 36px 24px; }
main { max-width: 1180px; margin: auto; background: white; border: 1px solid #d5dfe8; box-shadow: 0 8px 36px #172b4210; }
header { background: #142b40; color: #fff; padding: 28px 36px 24px; border-top: 5px solid #24aa9f; }
.brand-row { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 28px; }
.brand { font-size: 19px; font-weight: 750; letter-spacing: .14em; }
.brand small { display: block; font-size: 9px; letter-spacing: .17em; font-weight: 500; margin-top: 5px; color: #c0d0de; }
.report-tag { padding: 7px 12px; border: 1px solid #6b8396; border-radius: 4px; font-size: 10px; letter-spacing: .12em; color: #e4edf5; }
h1 { margin: 0 0 8px; font-size: 30px; line-height: 1.25; font-weight: 650; letter-spacing: -.025em; }
.subtitle { margin: 0 0 22px; color: #c5d5e2; font-size: 13px; }
header dl { border-top: 1px solid #496073; padding-top: 18px; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px 24px; }
header dl > div:nth-child(-n+2) { grid-column: span 2; }
header dt { color: #bdd0de; font-size: 10px; }
header dd { font-size: 12px; color: #fff; }
header dl > div:nth-child(-n+2) dd { font-family: ui-monospace, Consolas, monospace; font-size: 11px; }
section { padding: 28px 36px; border-bottom: 1px solid #dce5ed; }
h2 { margin: 0 0 20px; font-size: 18px; letter-spacing: -.02em; font-weight: 650; }
.section-number { color: #16766f; font-size: 11px; font-weight: 700; letter-spacing: .08em; display: inline-block; margin-right: 12px; vertical-align: middle; }
p { line-height: 1.6; }
.eyebrow { color: #126c67; font-size: 10px; font-weight: 700; letter-spacing: .12em; margin: 0 0 12px; }
.notice { margin: 0; padding: 12px 36px; color: #4d6275; background: #f1f6f8; font-size: 11px; border-bottom: 1px solid #dce5ed; }
.uncertainty { border-left: 3px solid #a56519; background: #fff6e9; padding: 12px 16px; margin: 0 0 20px; }
.uncertainty strong { display: block; color: #78470c; font-size: 13px; }
.uncertainty p { color: #6b512f; margin: 4px 0 0; font-size: 12px; }
.metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; border: 1px solid #d7e2e9; border-radius: 6px; overflow: hidden; }
.metrics > div { padding: 18px 20px; background: #f7fafb; border-right: 1px solid #d7e2e9; }
.metrics > div:last-child { border-right: 0; }
.metrics dt { font-size: 11px; margin-bottom: 8px; }
.metrics dd { font-size: 30px; line-height: 1; font-weight: 650; letter-spacing: -.04em; color: #153d50; }
.metrics > div:nth-child(3) dd { color: #0c7169; }
.counters { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 24px; margin-top: 12px; }
.counters > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 11px 0; border-bottom: 1px solid #e4ebf0; }
.counters dt { font-size: 11px; margin: 0; }
.counters dd { font-size: 15px; font-weight: 650; }
.method-note { font-size: 11px; color: #526679; margin: 16px 0 0; }
.charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 24px; }
.chart { margin: 0; padding: 20px; border: 1px solid #dce5ec; border-radius: 6px; break-inside: avoid; }
.chart figcaption { font-size: 13px; font-weight: 650; margin-bottom: 22px; }
.chart ul { margin: 0; padding: 0; list-style: none; }
.chart li { margin-bottom: 16px; }
.bar-label { display: flex; justify-content: space-between; gap: 12px; font-size: 11px; margin-bottom: 7px; }
.bar-label strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
.bar-track { height: 9px; background: #edf2f5; border-radius: 2px; overflow: hidden; }
.bar-fill { display: block; height: 100%; background: #16837b; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.bar-1 { background: #526f94; }
.chart-axis { display: flex; justify-content: space-between; border-top: 1px solid #dce5ec; padding-top: 5px; font-size: 10px; color: #637487; font-variant-numeric: tabular-nums; }
.chart-note { font-size: 10px; color: #526679; margin: 14px 0 0; }
dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 18px; margin: 0; }
dt { font-size: 11px; color: #526679; margin-bottom: 6px; }
dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.latencies { grid-template-columns: repeat(7, minmax(0, 1fr)); }
.latencies dd { font-size: 19px; font-weight: 600; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 11px; table-layout: fixed; min-width: 780px; }
caption { text-align: left; padding: 14px 0 10px; color: #526679; font-size: 11px; }
th, td { text-align: left; vertical-align: top; border-bottom: 1px solid #dce5ed; padding: 12px 8px; overflow-wrap: anywhere; }
thead { background: #eaf1f5; }
thead th { color: #29465d; font-size: 10px; font-weight: 650; }
tbody tr:nth-child(even) { background: #f7f9fb; }
tbody tr.unconfirmed { background: #fff7eb; }
tbody tr.unconfirmed > th { border-left: 3px solid #a56519; }
td dl { display: block; }
td dl div { margin-bottom: 9px; }
td dl div:last-child { margin-bottom: 0; }
td dt { font-size: 9px; margin-bottom: 3px; }
td:nth-child(2) dd, td:nth-child(3) dd, td:nth-child(5) dd { font-family: ui-monospace, Consolas, monospace; font-size: 10px; }
footer { color: #526679; font-size: 10px; padding: 18px 36px; background: #f7fafb; }
footer p { margin: 0; }
@media (max-width: 760px) {
  body { padding: 12px; }
  header, section { padding: 22px; }
  .notice, footer { padding: 14px 22px; }
  header dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metrics, .counters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metrics > div:nth-child(2) { border-right: 0; }
  .metrics > div:nth-child(-n+2) { border-bottom: 1px solid #d7e2e9; }
  .charts { grid-template-columns: 1fr; }
  .latencies { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .brand-row { align-items: start; flex-wrap: wrap; }
  .brand { font-size: 16px; }
  .brand small { font-size: 8px; }
  .report-tag { font-size: 9px; white-space: nowrap; }
  h1 { font-size: 25px; }
}
@media print {
  @page { size: A4 landscape; margin: 12mm; }
  :root { background: white; }
  body { padding: 0; }
  main { border: 0; box-shadow: none; }
  header { background: white; color: #142b40; padding: 16px 12px; }
  header dt, header dd, .brand small, .report-tag, .subtitle { color: #29465d; }
  header dl { border-color: #dce5ed; }
  section { padding: 20px 12px; }
  .notice, footer { padding: 10px 12px; }
  .table-wrap { overflow: visible; }
  table { min-width: 0; font-size: 10px; }
  thead { display: table-header-group; }
  tr, dl > div, .metrics, .uncertainty { break-inside: avoid; }
  h2 { break-after: avoid; }
}
`;

export function renderLoadHtml(evidence: Evidence): string {
  const { run } = evidence;
  const { plan, metrics } = run;
  const rows = run.operations
    .map(
      (
        item,
        index,
      ) => `<tr${item.sent && !item.received ? ' class="unconfirmed"' : ''}><th scope="row">${index + 1}</th>
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
<div class="report-overview">
<header><div class="brand-row"><div class="brand">COONECTA<small>ATM TRANSACTION SIMULATOR</small></div><span class="report-tag">QA · ${escapeHtml(run.state)}</span></div>
<h1>Informe de carga y estrés</h1>
<p class="subtitle">${plan.operation === 'WITHDRAWAL' ? 'Retiro' : 'Consulta de saldo'} · ${plan.mode === 'STRESS' ? 'Prueba de estrés' : 'Prueba de carga'} · Evidencia local de ejecución</p>
<dl>${fields([
    ['Corrida (runId)', run.runId],
    ['Solicitud de corrida', run.requestId],
    ['Inicio (UTC)', run.startedAt],
    ['Fin (UTC)', run.finishedAt],
    ['Duración total (ms)', run.elapsedMs],
    ['Exportado (UTC)', evidence.exportedAt],
  ])}</dl></header>
<p class="notice">${escapeHtml(evidence.notice)}</p>
<section aria-labelledby="results"><h2 id="results"><span class="section-number" aria-hidden="true">01</span>Resultados de ejecución</h2>
${
  metrics.unconfirmed > 0
    ? `<aside class="uncertainty" aria-label="Envíos sin respuesta"><strong>${metrics.unconfirmed} ${metrics.unconfirmed === 1 ? 'envío sin respuesta registrada' : 'envíos sin respuesta registrada'}</strong><p>Resultado financiero incierto. Revisa la correlación de estas operaciones; el informe no determina si hubo débito ni confirma conciliación en Core.</p></aside>`
    : ''
}
<dl class="metrics">${fields([
    ['Enviadas', metrics.sent],
    ['Respuestas recibidas', metrics.received],
    ['TPS observado', decimal(metrics.tps)],
    ['p95 (ms)', decimal(metrics.p95)],
  ])}</dl>
<dl class="counters">${fields([
    ['Operaciones registradas', run.operations.length],
    ['Aprobadas', metrics.approved],
    ['Rechazadas', metrics.declined],
    ['Timeouts', metrics.timeouts],
    ['Errores (incluye timeouts)', metrics.errors],
    ['Canceladas', metrics.cancelled],
    ['Enviadas sin respuesta', metrics.unconfirmed],
    ['TPS objetivo', plan.targetTps],
  ])}</dl>
${visualSummary(evidence)}
<p class="method-note">Los contadores no son categorías excluyentes. TPS observado = envíos / tiempo total,
incluida preparación y cierre. El objetivo y la finalización no acreditan capacidad del host;
en estrés el objetivo corresponde al pico de la rampa.</p></section>
</div>
<section aria-labelledby="latency"><h2 id="latency"><span class="section-number" aria-hidden="true">02</span>Latencia de respuestas (ms)</h2>
<dl class="latencies">${fields([
    ['Mínima', decimal(metrics.min)],
    ['Promedio', decimal(metrics.avg)],
    ['Máxima', decimal(metrics.max)],
    ['p50', decimal(metrics.p50)],
    ['p90', decimal(metrics.p90)],
    ['p95', decimal(metrics.p95)],
    ['p99', decimal(metrics.p99)],
  ])}</dl><p class="method-note">Solo respuestas recibidas. Sin respuestas, la latencia se muestra como «Sin dato».</p></section>
<section aria-labelledby="plan"><h2 id="plan"><span class="section-number" aria-hidden="true">03</span>Configuración de la corrida</h2>
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
<section aria-labelledby="operations"><h2 id="operations"><span class="section-number" aria-hidden="true">04</span>Detalle por operación</h2>
<p class="method-note">Identificadores y resultados conservados tal como fueron registrados. «Sin dato» indica
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
