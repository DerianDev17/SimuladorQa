import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import { withdrawalHostNotApproved } from '../../../../packages/domain/src/balance-inquiry';

export interface DashboardActivityRow {
  id: string;
  occurredAt: string;
  atmId: string;
  terminalId: string | null;
  operation: 'Consulta de saldo' | 'Retiro' | 'Reverso';
  amount: string | null;
  outcome: string;
  tone: 'success' | 'danger' | 'pending' | 'neutral';
  responseCode: string | null;
  elapsedMs: number | null;
  reference: string;
  searchReference: string;
}

function originalOutcome(
  execution: BalanceExecution,
): Pick<DashboardActivityRow, 'outcome' | 'tone'> {
  if (execution.outcome === 'APPROVED')
    return {
      outcome: execution.withdrawal ? 'Autorizado por el host' : 'Aprobada',
      tone: 'success',
    };
  if (execution.outcome === 'NOT_APPROVED' || withdrawalHostNotApproved(execution))
    return { outcome: 'No aprobada', tone: 'danger' };
  if (execution.outcome === 'PENDING') return { outcome: 'En preparación', tone: 'pending' };
  if (execution.outcome === 'REQUIRES_REVIEW') return { outcome: 'Por revisar', tone: 'pending' };
  return { outcome: 'Sin resultado confirmado', tone: 'neutral' };
}

export function dashboardActivityRows(
  executions: readonly BalanceExecution[],
): DashboardActivityRow[] {
  const rows: DashboardActivityRow[] = [];
  for (const execution of executions) {
    // A local validation failure is an attempt, not a transaction on the wire.
    if (!execution.transmissionAttempted && execution.outcome !== 'PENDING') continue;
    if (execution.outcome === 'PENDING' && !execution.frameGenerated) continue;
    rows.push({
      id: execution.transactionId,
      occurredAt: execution.startedAt,
      atmId: execution.atmId,
      terminalId: execution.correlation?.terminalId ?? null,
      operation: execution.withdrawal ? 'Retiro' : 'Consulta de saldo',
      amount: execution.withdrawal?.amount ?? null,
      ...originalOutcome(execution),
      responseCode: execution.responseCode,
      elapsedMs: execution.finishedAt ? execution.elapsedMs : null,
      reference: execution.correlation?.stan ?? execution.transactionId.slice(0, 8),
      searchReference: [
        execution.requestId,
        execution.transactionId,
        execution.correlation?.stan,
        execution.correlation?.rrn,
      ]
        .filter(Boolean)
        .join(' '),
    });
    const reversal = execution.reversal;
    if (!reversal?.transmissionAttempted) continue;
    const reversalStatus =
      reversal.outcome === 'APPROVED'
        ? { outcome: 'Aceptado por el host', tone: 'success' as const }
        : reversal.outcome === 'NOT_APPROVED'
          ? { outcome: 'No aprobado', tone: 'danger' as const }
          : { outcome: 'Sin resultado confirmado', tone: 'pending' as const };
    rows.push({
      id: reversal.transactionId,
      occurredAt: reversal.finishedAt ?? reversal.dueAt ?? execution.startedAt,
      atmId: execution.atmId,
      terminalId: execution.correlation?.terminalId ?? null,
      operation: 'Reverso',
      amount: execution.withdrawal?.amount ?? null,
      ...reversalStatus,
      responseCode: reversal.responseCode,
      elapsedMs: null,
      reference: reversal.transactionId.slice(0, 8),
      searchReference: `${reversal.transactionId} ${execution.correlation?.stan ?? ''} ${execution.correlation?.rrn ?? ''}`,
    });
  }
  return rows.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50);
}
