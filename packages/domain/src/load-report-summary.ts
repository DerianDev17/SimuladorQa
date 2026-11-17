import type { loadRunEvidence } from './load-export';
import { loadBusinessContext } from './load-report-business-context';
type Evidence = ReturnType<typeof loadRunEvidence>;

const states: Record<Evidence['run']['state'], string> = {
  COMPLETED: 'Completada',
  STOPPED: 'Detenida',
  FAILED: 'Finalizada con fallo',
  INTERRUPTED: 'Interrumpida',
  RUNNING: 'En ejecución',
  STOPPING: 'En cierre',
};
export function loadBusinessSummary(evidence: Evidence) {
  const { run } = evidence;
  const { metrics: m, plan } = run;
  const context = loadBusinessContext(evidence);
  const conclusion =
    m.sent === 0
      ? 'No hay envíos registrados. Esta corrida no aporta evidencia de respuesta del sistema.'
      : context.counts.review > 0
        ? `Hay ${context.counts.review} ${context.counts.review === 1 ? 'operación enviada' : 'operaciones enviadas'} con resultado local por revisar. ${context.counts.reviewWithResponse > 0 ? `Con respuesta registrada: ${context.counts.reviewWithResponse}. ` : ''}${plan.operation === 'WITHDRAWAL' ? 'Su resultado financiero sigue pendiente de verificación.' : 'La consulta y su saldo requieren verificación funcional.'}`
        : m.errors > 0 || m.declined > 0
          ? 'Se registraron respuestas no aprobadas o errores. Deben contrastarse con el resultado esperado de la prueba.'
          : 'La corrida registra respuestas sin envíos pendientes de respuesta. Esto describe la ejecución local; no constituye una aprobación para producción.';
  const findings = [
    `Se registraron ${run.operations.length} operaciones: ${m.sent} envíos y ${m.received} respuestas.`,
    `El registro clasifica ${m.approved} operaciones como aprobadas y ${m.declined} como no aprobadas. Una no aprobación no identifica por sí sola un defecto.`,
    `Errores registrados: ${m.errors}; vencimientos de plazo incluidos: ${m.timeouts}; cancelaciones locales: ${m.cancelled}. Estos contadores pueden solaparse.`,
  ];
  if (plan.mode === 'STRESS')
    findings.push(
      'La velocidad objetivo es el pico de una rampa. El promedio de toda la corrida no permite afirmar que ese pico se mantuvo.',
    );
  else if (m.sent > 0)
    findings.push(
      m.tps < plan.targetTps
        ? 'La velocidad promedio observada fue inferior al objetivo configurado. Esta medición incluye preparación y cierre; no identifica por sí sola la causa.'
        : 'La velocidad promedio observada alcanzó o superó el objetivo configurado. Esto no demuestra capacidad sostenida ni representa un límite máximo del sistema.',
    );
  if (run.state !== 'COMPLETED')
    findings.push(
      `Estado registrado: «${states[run.state]}». La corrida no alcanzó el estado completado.`,
    );
  const nextSteps = context.actions.map((item) => item.action);
  return { state: states[run.state], conclusion, findings, nextSteps };
}

export function loadStageSummary(evidence: Evidence) {
  const stages = [
    ['queueWaitMs', 'Espera del lector'],
    ['rateLimitMs', 'Espera por límite TPS'],
    ['connectionWaitMs', 'Espera del enlace'],
    ['cardReadMs', 'Lectura del chip'],
    ['inspectMs', 'Validación de perfil'],
    ['contextMs', 'PIN, EMV y contexto'],
    ['validationMs', 'Revalidación'],
    ['journalMs', 'Diario local'],
    ['transportMs', 'Transporte y respuesta'],
    ['otherMs', 'Otras etapas'],
    ['totalMs', 'Total por operación'],
  ] as const;
  return stages.map(([key, label]) => {
    const values = evidence.run.operations.flatMap((item) => {
      const value = item.timings?.[key];
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? [value] : [];
    });
    const sum = values.length ? values.reduce((total, value) => total + value, 0) : null;
    return {
      key,
      label,
      samples: values.length,
      sum,
      avg: sum === null ? null : sum / values.length,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  });
}
