import type { loadRunEvidence } from './load-export';
import { isWithdrawalAmount } from './withdrawal';
type Evidence = ReturnType<typeof loadRunEvidence>;

// Reporting groups use stored outcomes, not an inferred response-code mapping.
export function loadBusinessContext(evidence: Evidence) {
  const { run } = evidence;
  const counts = { notSent: 0, approved: 0, notApproved: 0, review: 0, reviewWithResponse: 0 };
  for (const item of run.operations) {
    if (!item.sent) counts.notSent++;
    else if (item.received && item.outcome === 'APPROVED') counts.approved++;
    else if (item.received && item.outcome === 'NOT_APPROVED') counts.notApproved++;
    else {
      counts.review++;
      if (item.received) counts.reviewWithResponse++;
    }
  }
  const withdrawal = run.plan.operation === 'WITHDRAWAL';
  const checks: [string, string][] = withdrawal
    ? [
        [
          'Autorización del host',
          `${counts.approved} solicitudes enviadas con resultado local aprobado. No representa entrega de efectivo.`,
        ],
        [
          'Entrega de efectivo',
          'No acreditada por el simulador: la carga no opera un dispensador físico.',
        ],
        [
          'Débito, comisiones y saldo posterior',
          'No incluidos en esta evidencia. Requieren verificación correlacionada en el sistema contable.',
        ],
        [
          'Reversos',
          'La carga no ejecuta reversos automáticos. No se asume una devolución por un timeout.',
        ],
      ]
    : [
        [
          'Respuesta a la consulta',
          `${counts.approved} consultas enviadas con resultado local aprobado. Describe el resultado local de la respuesta.`,
        ],
        [
          'Exactitud del saldo informado',
          'No evaluada en este informe de carga: no contiene los valores de saldo ni una referencia esperada para compararlos.',
        ],
        [
          'Validación con la entidad',
          'Requiere contrastar el diario financiero y una fuente de saldo aprobada; no se infiere a partir de los tiempos de respuesta.',
        ],
      ];
  const actions: { area: string; action: string; evidence: string }[] = [];
  if (run.operations.length === 0)
    actions.push({
      area: 'QA de la estación',
      action:
        'Revisar preparación y dependencias: no hay operaciones registradas para evaluar el servicio.',
      evidence:
        'Estado de corrida y diagnóstico local; no atribuir la ausencia de muestra al host.',
    });
  if (counts.review > 0)
    actions.push({
      area: withdrawal ? 'QA y conciliación' : 'QA funcional',
      action: withdrawal
        ? 'Verificar el estado de los retiros por revisar antes de decidir nuevas acciones. No asumir débito, ausencia de débito ni reverso.'
        : 'Revisar las consultas con resultado no concluyente y, si hay saldo registrado, contrastarlo en el diario financiero.',
      evidence:
        'Resultado local, código y correlación por operación del informe técnico; evidencia adicional del sistema responsable.',
    });
  if (counts.notSent > 0)
    actions.push({
      area: 'QA de la estación',
      action:
        'Revisar las operaciones sin envío registrado y la preparación local antes de repetir la prueba.',
      evidence:
        'Resultado por operación y tiempos de lector, contexto, validación y diario. Sin envío registrado no significa indisponibilidad del host.',
    });
  if (counts.notApproved > 0)
    actions.push({
      area: 'QA funcional',
      action:
        'Contrastar las no aprobaciones con el resultado esperado del escenario. No confundir una negativa esperada con un defecto.',
      evidence:
        'Códigos originales y caso de prueba aprobado; no se deduce la causa desde un código aislado.',
    });
  if (run.plan.mode === 'LOAD' && run.metrics.sent > 0 && run.metrics.tps < run.plan.targetTps)
    actions.push({
      area: 'Pruebas de rendimiento',
      action:
        'Analizar preparación, esperas y transporte para explicar la diferencia con el objetivo configurado.',
      evidence:
        'Tiempos por etapa y cobertura de muestras. No atribuir toda la duración al Switch/Core.',
    });
  actions.push({
    area: 'Responsables de aceptación',
    action: 'Definir criterios por servicio y escenario antes de aprobar una entrega.',
    evidence: withdrawal
      ? 'Autorización, tratamiento de incertidumbre, evidencia contable y objetivos de rendimiento acordados.'
      : 'Respuesta, exactitud del saldo y objetivos de rendimiento acordados.',
  });
  return {
    counts,
    purpose: withdrawal
      ? 'Evaluar solicitudes de autorización de retiro en QA. La respuesta del host, la entrega de efectivo y el asiento contable son comprobaciones distintas.'
      : 'Evaluar la consulta de saldo en QA. Obtener una respuesta y comprobar que el saldo informado es correcto son comprobaciones distintas.',
    approvalLabel: withdrawal ? 'Autorizadas por el host' : 'Consultas aprobadas',
    checks,
    actions,
    amounts: withdrawal
      ? {
          sent: requestedAmount(run.plan.amount, run.metrics.sent),
          approved: requestedAmount(run.plan.amount, counts.approved),
          notApproved: requestedAmount(run.plan.amount, counts.notApproved),
          review: requestedAmount(run.plan.amount, counts.review),
        }
      : null,
  };
}

function requestedAmount(amount: string | null, count: number): string {
  if (!isWithdrawalAmount(amount)) throw Error('LOAD_REPORT_AMOUNT_INVALID');
  const cents = BigInt(amount.replace('.', '')) * BigInt(count);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}
