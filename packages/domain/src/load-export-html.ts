import type { loadRunEvidence, LoadReportAudience } from './load-export';
import { decimal, escapeHtml, fields } from './load-export-html-format';
import { renderLoadBusinessHtml } from './load-export-business';
import { loadStageSummary } from './load-report-summary';
import { loadBusinessContext } from './load-report-business-context';

// Only the public evidence projection may reach this presentation function.
type Evidence = ReturnType<typeof loadRunEvidence>;
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
.report-nav { display: flex; flex-wrap: wrap; gap: 4px 20px; padding: 13px 36px; border-bottom: 1px solid #dce5ed; background: #f7fafb; }
.report-nav a { padding: 5px 0; color: #37546a; font-size: 11px; text-decoration: none; border-bottom: 2px solid transparent; }
.report-nav a:hover { color: #126c67; border-bottom-color: #126c67; }
.report-nav a:focus-visible { outline: 2px solid #126c67; outline-offset: 4px; }
h2[id] { scroll-margin-top: 20px; }
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
.business-conclusion { border-left: 3px solid #16837b; padding: 18px 22px; background: #f1f7f7; margin-bottom: 24px; }
.business-conclusion p { margin: 0; font-size: 16px; line-height: 1.6; }
.business-conclusion .conclusion-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px; color: #356762; }
.business-conclusion.needs-review { border-color: #a56519; background: #fff8ed; }
.business-conclusion.needs-review .conclusion-label { color: #78470c; }
.business-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; }
.business-grid article { padding: 0 24px 0 0; }
.business-grid article + article { padding: 0 0 0 24px; border-left: 1px solid #dce5ec; }
h3 { font-size: 14px; margin: 0 0 14px; }
article p, article li { font-size: 12px; line-height: 1.7; }
article ul, article ol { padding-left: 18px; margin: 0; }
article li + li { margin-top: 8px; }
.findings-list { list-style: none; padding-left: 0; }
.findings-list li { padding: 0 0 10px; border-bottom: 1px solid #e4ebf0; }
.findings-list li:last-child { border-bottom: 0; padding-bottom: 0; }
.next-steps { background: #f7fafb; border: 1px solid #dce5ec; border-radius: 6px; padding: 20px 24px; }
.next-steps ol { counter-reset: actions; list-style: none; padding-left: 0; }
.next-steps li { counter-increment: actions; position: relative; min-height: 28px; padding-left: 42px; margin: 0 0 14px; }
.next-steps li:last-child { margin-bottom: 0; }
.next-steps li::before { content: counter(actions, decimal-leading-zero); position: absolute; left: 0; top: 0; color: #126c67; font-size: 12px; font-weight: 700; line-height: 26px; width: 28px; text-align: center; border: 1px solid #b8d6d1; border-radius: 4px; }
.business-report header { padding-bottom: 20px; }
.business-report .brand-row { margin-bottom: 22px; }
.business-report h2 { margin-bottom: 24px; }
.business-report .metrics { border: 0; gap: 16px; border-radius: 0; }
.business-report .metrics > div { border: 1px solid #d7e2e9; border-radius: 5px; background: white; }
.business-report .metrics dd { font-size: 34px; }
.business-report header dl > div { grid-column: auto; }
.business-report header dl > div:nth-child(-n+2) dd { font-family: inherit; }
.business-report .metrics dd { color: #153d50; }
.business-report .metrics > div:last-child dd { color: #78470c; }
.methodology { font-size: 12px; line-height: 1.7; padding-left: 18px; }
.stage-table td { font-variant-numeric: tabular-nums; }
.review-heading { margin-top: 24px; }
.service-checks { display: block; }
.service-checks > div { margin-bottom: 14px; }
.service-checks dt { font-size: 12px; font-weight: 650; color: #29465d; }
.service-checks dd { font-size: 12px; line-height: 1.6; }
.requested-amounts { margin-top: 24px; border-top: 1px solid #dce5ed; padding-top: 20px; }
.next-steps li strong { font-weight: 600; }
.next-steps li p { color: #526679; margin: 5px 0 0; font-size: 11px; }
@media (max-width: 760px) {
  body { padding: 12px; }
  header, section { padding: 22px; }
  .notice, footer { padding: 14px 22px; }
  .report-nav { padding: 12px 22px; gap: 2px 16px; }
  header dl { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metrics, .counters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .metrics > div:nth-child(2) { border-right: 0; }
  .metrics > div:nth-child(-n+2) { border-bottom: 1px solid #d7e2e9; }
  .charts, .business-grid { grid-template-columns: 1fr; }
  .business-grid article { padding: 0; }
  .business-grid article + article { border-left: 0; border-top: 1px solid #dce5ec; padding: 22px 0 0; }
  .business-report .metrics { gap: 10px; }
  .business-report .metrics > div { padding: 16px 14px; border: 1px solid #d7e2e9; }
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
  .report-nav { display: none; }
  header { background: white; color: #142b40; padding: 16px 12px; }
  header dt, header dd, .brand small, .report-tag, .subtitle { color: #29465d; }
  header dl { border-color: #dce5ed; }
  section { padding: 20px 12px; }
  .notice, footer { padding: 10px 12px; }
  .table-wrap { overflow: visible; }
  table { min-width: 0; font-size: 10px; }
  thead { display: table-header-group; }
  tr, dl > div, .metrics, .uncertainty, .business-grid article, .next-steps { break-inside: avoid; }
  h2, h3 { break-after: avoid; }
}
`;

export function renderLoadHtml(
  evidence: Evidence,
  audience: LoadReportAudience = 'TECHNICAL',
): string {
  if (audience === 'BUSINESS') return renderLoadBusinessHtml(evidence, styles);
  const { run } = evidence;
  const { plan, metrics } = run;
  const context = loadBusinessContext(evidence);
  const rows = run.operations
    .map(
      (
        item,
        index,
      ) => `<tr${item.sent && (!item.received || !['APPROVED', 'NOT_APPROVED'].includes(item.outcome)) ? ' class="unconfirmed"' : ''}><th scope="row">${index + 1}</th>
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
<h1>Informe técnico de carga y estrés</h1>
<p class="subtitle">${plan.operation === 'WITHDRAWAL' ? 'Retiro' : 'Consulta de saldo'} · ${plan.mode === 'STRESS' ? 'Prueba de estrés' : 'Prueba de carga'} · Evidencia local de ejecución</p>
<dl>${fields([
    ['Corrida (runId)', run.runId],
    ['Solicitud de corrida', run.requestId],
    ['Inicio (UTC)', run.startedAt],
    ['Fin (UTC)', run.finishedAt],
    ['Duración total (ms)', run.elapsedMs],
    ['Exportado (UTC)', evidence.exportedAt],
  ])}</dl></header>
<nav class="report-nav" aria-label="Contenido del informe técnico"><a href="#results">01 Resultados</a><a href="#latency">02 Latencias</a><a href="#plan">03 Configuración</a><a href="#stages">04 Etapas</a><a href="#methodology">05 Metodología</a><a href="#operations">06 Operaciones</a></nav>
<p class="notice">${escapeHtml(evidence.notice)}</p>
<section aria-labelledby="results"><h2 id="results"><span class="section-number" aria-hidden="true">01</span>Resultados de ejecución</h2>
${
  metrics.unconfirmed > 0
    ? `<aside class="uncertainty" aria-label="Envíos sin respuesta"><strong>${metrics.unconfirmed} ${metrics.unconfirmed === 1 ? 'envío sin respuesta registrada' : 'envíos sin respuesta registrada'}</strong><p>${plan.operation === 'WITHDRAWAL' ? 'Resultado financiero incierto. Revisa la correlación de estas operaciones; el informe no determina si hubo débito ni confirma conciliación en Core.' : 'Consulta sin respuesta registrada. Revisa resultado y correlación; este informe no permite validar el saldo esperado.'}</p></aside>`
    : ''
}
${context.counts.reviewWithResponse > 0 ? `<aside class="uncertainty" aria-label="Respuestas por revisar"><strong>${context.counts.reviewWithResponse} respuestas con resultado local por revisar</strong><p>Un código registrado no asegura una respuesta válida ni un resultado concluyente. Consulta las filas destacadas y conserva la correlación para su verificación.</p></aside>` : ''}
<dl class="metrics">${fields([
    ['Enviadas', metrics.sent],
    ['Respuestas recibidas', metrics.received],
    ['TPS observado', decimal(metrics.tps)],
    ['p95 (ms)', decimal(metrics.p95)],
  ])}</dl>
<dl class="counters">${fields([
    ['Operaciones registradas', run.operations.length],
    ['Aprobadas', metrics.approved],
    ['No aprobadas', metrics.declined],
    ['Timeouts', metrics.timeouts],
    ['Errores (incluye timeouts)', metrics.errors],
    ['Canceladas', metrics.cancelled],
    ['Enviadas sin respuesta', metrics.unconfirmed],
    ['TPS objetivo', plan.targetTps],
  ])}</dl>
${visualSummary(evidence)}
<h3 class="review-heading">Separación para revisión operativa</h3><dl class="counters">${fields([
    ['Sin envío registrado', context.counts.notSent],
    ['Enviadas y aprobadas', context.counts.approved],
    ['Enviadas y no aprobadas', context.counts.notApproved],
    ['Enviadas por revisar', context.counts.review],
    ['Por revisar con respuesta', context.counts.reviewWithResponse],
  ])}</dl><p class="method-note">Los primeros cuatro grupos particionan las operaciones registradas. «Por revisar con respuesta» es un subconjunto, no se suma al total. La tabla conserva outcome y código originales; no se reclasifican códigos históricos.</p>
<p class="method-note">Los contadores generales de errores, timeouts y cancelaciones pueden solaparse. TPS observado = envíos / tiempo total,
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
<section aria-labelledby="stages"><h2 id="stages"><span class="section-number" aria-hidden="true">04</span>Tiempos por etapa</h2>
<p class="method-note">Cada fila usa solo las operaciones con esa medición registrada. No se asignan ceros a datos ausentes. Las sumas de operaciones concurrentes pueden superar el tiempo total de la corrida; las filas no deben sumarse entre sí.</p>
<div class="table-wrap"><table class="stage-table"><caption>Cobertura y tiempos por etapa (ms)</caption>
<thead><tr><th scope="col">Etapa</th><th scope="col">Muestras / operaciones</th><th scope="col">Promedio</th><th scope="col">Mínimo</th><th scope="col">Máximo</th><th scope="col">Suma registrada</th></tr></thead><tbody>
${loadStageSummary(evidence)
  .map(
    (stage) =>
      `<tr><th scope="row">${escapeHtml(stage.label)}</th><td>${stage.samples} / ${run.operations.length}</td><td>${escapeHtml(decimal(stage.avg))}</td><td>${escapeHtml(decimal(stage.min))}</td><td>${escapeHtml(decimal(stage.max))}</td><td>${escapeHtml(decimal(stage.sum))}</td></tr>`,
  )
  .join('')}
</tbody></table></div></section>
<section aria-labelledby="methodology"><h2 id="methodology"><span class="section-number" aria-hidden="true">05</span>Metodología y límites de interpretación</h2>
<ul class="methodology"><li>Fuente: registro local persistido de esta corrida; no se consulta Switch/Core al generar el informe.</li>
<li>TPS = envíos × 1000 / duración total en milisegundos. Incluye preparación, esperas y cierre. En estrés, el objetivo es un pico de rampa.</li>
<li>Latencias: duración de transporte de respuestas recibidas. Percentil p = valor ordenado en la posición techo(n × p), con posiciones desde 1. Sin respuestas, el valor es «Sin dato».</li>
<li>En este registro, sent indica bytes encolados por el transporte; no acredita recepción en Core. received indica código de respuesta registrado; no implica aprobación ni respuesta funcional válida. Un error de interpretación puede conservar received=false aun si llegaron bytes.</li>
<li>Errores incluye timeouts y excluye cancelaciones locales. Enviadas sin respuesta puede coincidir con errores; los contadores no se suman como categorías excluyentes.</li>
<li>Resultados, códigos de respuesta y correlación se conservan sin remapeo. La finalización de la corrida no certifica su resultado financiero ni el cumplimiento de un SLA.</li>
</ul></section>
<section aria-labelledby="operations"><h2 id="operations"><span class="section-number" aria-hidden="true">06</span>Detalle por operación</h2>
<p class="method-note">Identificadores y resultados conservados tal como fueron registrados. «Sin dato» indica
información ausente; no se infiere un ATM cuando un registro antiguo tiene varios perfiles.</p>
<p class="method-note">Las filas destacadas corresponden a envíos sin respuesta registrada o con resultado distinto de APPROVED/NOT_APPROVED, incluidos REQUIRES_REVIEW, INVALID_RESPONSE y STORAGE_ERROR. Se mantienen para revisión, sin afirmar débito ni ausencia de débito.</p>
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
