import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import { withdrawalHostNotApproved } from '../../../../packages/domain/src/balance-inquiry';
import { reversalOutcomeLabels } from '../../../../packages/domain/src/withdrawal-reversal';
export const balanceOutcomeLabels: Record<BalanceExecution['outcome'], string> = {
  PENDING: 'Resultado pendiente',
  BLOCKED: 'Consulta bloqueada',
  APPROVED: 'Consulta aprobada',
  NOT_APPROVED: 'Consulta no aprobada',
  REQUIRES_REVIEW: 'Respuesta del host por revisar',
  INVALID_RESPONSE: 'Respuesta inválida',
  CONNECT_TIMEOUT: 'Conexión sin respuesta',
  RESPONSE_TIMEOUT: 'Sin respuesta financiera dentro del plazo',
  PEER_CLOSED: 'El destino cerró la conexión',
  TRANSPORT_ERROR: 'Error de comunicación',
  CONTEXT_ERROR: 'Contexto QA no disponible',
  STORAGE_ERROR: 'Resultado sin guardar',
};
export function executionOutcomeLabel(execution: BalanceExecution): string {
  if (execution.reversal && execution.outcome === 'APPROVED')
    return reversalOutcomeLabels[execution.reversal.outcome];
  if (withdrawalHostNotApproved(execution)) return 'Retiro no aprobado';
  if (execution.deposit) {
    if (execution.outcome === 'APPROVED') return 'Depósito autorizado por el host';
    if (execution.outcome === 'BLOCKED') return 'Depósito bloqueado';
    if (execution.outcome === 'NOT_APPROVED') return 'Depósito no aprobado';
  }
  if (execution.withdrawal) {
    if (execution.outcome === 'APPROVED') return 'Retiro autorizado por el host';
    if (execution.outcome === 'BLOCKED') return 'Retiro bloqueado';
    if (execution.outcome === 'NOT_APPROVED') return 'Retiro no aprobado';
  }
  return balanceOutcomeLabels[execution.outcome];
}
