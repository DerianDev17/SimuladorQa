import type { loadRunEvidence } from './load-export';
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
  const conclusion =
    m.sent === 0
      ? 'No hay envíos registrados. Esta corrida no aporta evidencia de respuesta del sistema.'
      : m.unconfirmed > 0
        ? 'Hay operaciones enviadas sin respuesta registrada. Su resultado financiero sigue pendiente de verificación.'
        : m.errors > 0 || m.declined > 0
          ? 'Se registraron rechazos o errores que requieren revisión antes de valorar el resultado de la prueba.'
          : 'La corrida registra respuestas sin envíos pendientes de respuesta. Esto describe la ejecución local; no constituye una aprobación para producción.';
  const findings = [
    `Se registraron ${run.operations.length} operaciones: ${m.sent} envíos y ${m.received} respuestas.`,
    `El registro clasifica ${m.approved} operaciones como aprobadas y ${m.declined} como rechazadas.`,
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
  const nextSteps: string[] = [];
  if (m.sent === 0)
    nextSteps.push(
      'Revisar la preparación y las dependencias antes de planificar una nueva prueba autorizada.',
    );
  if (m.unconfirmed > 0)
    nextSteps.push(
      'Verificar las operaciones sin respuesta con su correlación en Switch/Core antes de decidir nuevas acciones; no asumir ausencia de débito.',
    );
  if (m.errors > 0 || m.declined > 0)
    nextSteps.push(
      'Revisar los resultados y códigos del informe técnico con el equipo responsable; el reporte no atribuye una causa automáticamente.',
    );
  if (m.sent > 0 && plan.mode === 'LOAD' && m.tps < plan.targetTps)
    nextSteps.push(
      'Analizar los tiempos por etapa del informe técnico para explicar la diferencia frente a la velocidad objetivo.',
    );
  nextSteps.push(
    'Acordar criterios de aceptación y contrastar la evidencia con ellos antes de emitir un veredicto de negocio.',
  );
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
