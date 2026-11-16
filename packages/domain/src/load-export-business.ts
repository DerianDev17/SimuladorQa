import type { loadRunEvidence } from './load-export';
import { loadBusinessSummary } from './load-report-summary';
import { decimal, escapeHtml, fields } from './load-export-html-format';

export function renderLoadBusinessHtml(
  evidence: ReturnType<typeof loadRunEvidence>,
  styles: string,
): string {
  const { run } = evidence;
  const { plan, metrics: m } = run;
  const summary = loadBusinessSummary(evidence);
  const list = (items: string[]) => items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Informe de negocio · ${escapeHtml(run.runId)}</title><style>${styles}</style></head>
<body><main class="business-report"><div class="report-overview">
<header><div class="brand-row"><div class="brand">COONECTA<small>RESULTADOS DE PRUEBAS QA</small></div><span class="report-tag">NEGOCIO · QA</span></div>
<h1>Informe de negocio</h1><p class="subtitle">Evaluación de ejecución · ${escapeHtml(summary.state)}</p>
<dl>${fields([
    ['Inicio (UTC)', run.startedAt],
    ['Fin (UTC)', run.finishedAt],
    ['Operación evaluada', plan.operation === 'WITHDRAWAL' ? 'Retiro' : 'Consulta de saldo'],
    ['Duración observada', `${decimal(run.elapsedMs / 1000)} segundos`],
  ])}</dl></header>
<nav class="report-nav" aria-label="Contenido del informe de negocio"><a href="#business-results">01 Resumen ejecutivo</a><a href="#business-context">02 Alcance y hallazgos</a><a href="#business-performance">03 Rendimiento y pendientes</a><a href="#business-actions">04 Próximos pasos</a></nav>
<section aria-labelledby="business-results"><h2 id="business-results"><span class="section-number" aria-hidden="true">01</span>Resumen para decisión</h2>
<div class="business-conclusion${m.unconfirmed > 0 ? ' needs-review' : ''}"><p class="conclusion-label">Lectura de la evidencia</p><p>${escapeHtml(summary.conclusion)}</p></div>
<dl class="metrics">${fields([
    ['Operaciones enviadas', m.sent],
    ['Respuestas recibidas', m.received],
    ['Aprobaciones registradas', m.approved],
    ['Enviadas sin respuesta', m.unconfirmed],
  ])}</dl>
<p class="method-note">Aprobación registrada describe la respuesta local. No acredita débito, saldo final ni conciliación en el sistema contable.</p>
</section>
<section aria-labelledby="business-context"><h2 id="business-context"><span class="section-number" aria-hidden="true">02</span>Alcance y hallazgos</h2>
<div class="business-grid"><article><h3>Qué se probó</h3>
<p>Una prueba ${plan.mode === 'STRESS' ? 'de estrés con aumento gradual de actividad' : 'de carga'} en el ambiente QA, con ${plan.atms.length} ${plan.atms.length === 1 ? 'perfil de cajero configurado' : 'perfiles de cajero configurados'}.</p>
<dl>${fields([
    ['Límite de operaciones', plan.maxTransactions],
    ['Duración máxima configurada', `${plan.durationSeconds} segundos`],
    ['Monto por retiro', plan.amount === null ? 'No aplica' : `${plan.currency} ${plan.amount}`],
  ])}</dl><p class="method-note">Cantidad y duración son límites: alcanzar uno puede cerrar la planificación. No son compromisos comerciales ni prueba de cobertura de todos los escenarios.</p>
</article><article><h3>Qué se observó</h3><ul class="findings-list">${list(summary.findings)}</ul></article></div>
</section>
<section aria-labelledby="business-performance"><h2 id="business-performance"><span class="section-number" aria-hidden="true">03</span>Rendimiento y pendientes</h2>
<div class="business-grid"><article><h3>Velocidad y tiempo de respuesta</h3><dl>${fields([
    ['Promedio observado (envíos por segundo)', decimal(m.tps)],
    [
      plan.mode === 'STRESS'
        ? 'Objetivo pico (envíos por segundo)'
        : 'Objetivo configurado (envíos por segundo)',
      plan.targetTps,
    ],
    ['Tiempo medio de respuesta (segundos)', m.avg === null ? null : decimal(m.avg / 1000)],
    ['Respuestas usadas para medir el tiempo', m.received],
  ])}</dl><p class="method-note">El promedio de envíos incluye preparación y cierre. El tiempo de respuesta solo usa respuestas recibidas; los envíos sin respuesta quedan fuera de ese promedio.</p></article>
<article><h3>Qué falta confirmar</h3><ul>
<li>Criterios de aceptación: no están registrados en esta evidencia. No se emite un veredicto de aprobado/reprobado para negocio.</li>
<li>Conciliación contable y resultado financiero final: requieren evidencia adicional del sistema responsable.</li>
<li>Capacidad sostenida, disponibilidad y preparación para producción: una corrida local no las certifica.</li>
</ul></article></div>
</section>
<section aria-labelledby="business-actions"><h2 id="business-actions"><span class="section-number" aria-hidden="true">04</span>Próximos pasos sugeridos</h2>
<article class="next-steps"><ol>${list(summary.nextSteps)}</ol>
<p class="method-note">Estas acciones requieren revisión del equipo responsable; no implican reenvío automático ni autorización de nuevas operaciones.</p></article>
</section></div>
<footer><p>Referencia de corrida: ${escapeHtml(run.runId)} · Exportado (UTC): ${escapeHtml(evidence.exportedAt)}.</p>
<p>Fuente: registro local de la corrida. El informe técnico de la misma referencia contiene la configuración, los tiempos por etapa y la trazabilidad por operación. Este archivo presenta exclusivamente la lectura de negocio.</p></footer>
</main></body></html>`;
}
