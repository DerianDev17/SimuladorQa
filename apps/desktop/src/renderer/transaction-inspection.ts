import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import {
  balanceDeliveryUncertain,
  withdrawalHostNotApproved,
} from '../../../../packages/domain/src/balance-inquiry';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { reversalOutcomeLabels } from '../../../../packages/domain/src/withdrawal-reversal';
import { executionOutcomeLabel } from './transaction-outcome';

export type InspectionMessage = 'request' | 'response' | 'reversal-request' | 'reversal-response';
export type HistoryOutcome = 'all' | 'approved' | 'not-approved' | 'review' | 'pending' | 'blocked';
export interface HistoryFilters {
  query: string;
  atmId: string;
  outcome: HistoryOutcome;
}
export interface ExecutionStage {
  id: string;
  label: string;
  state: 'complete' | 'attention' | 'pending' | 'unavailable';
  detail: string;
  message?: InspectionMessage;
}
export function executionCategory(item: BalanceExecution): Exclude<HistoryOutcome, 'all'> {
  if (item.outcome === 'PENDING' || item.finishedAt === null || item.reversal?.finishedAt === null)
    return 'pending';
  if (balanceDeliveryUncertain(item)) return 'review';
  if (item.outcome === 'APPROVED') return 'approved';
  if (item.outcome === 'NOT_APPROVED' || withdrawalHostNotApproved(item)) return 'not-approved';
  return 'blocked';
}
function revision(item: BalanceExecution): string {
  return item.reversal?.finishedAt ?? item.finishedAt ?? item.startedAt;
}
function progress(item: BalanceExecution): number {
  const reversal = item.reversal;
  if (reversal)
    return reversal.finishedAt
      ? 6
      : reversal.outcome === 'SENDING'
        ? 5
        : reversal.outcome === 'WAITING'
          ? 4
          : 3;
  return item.finishedAt ? 2 : item.transmissionAttempted ? 1 : 0;
}
// Newer persisted snapshots win over stale polling/session records. Input order
// only breaks a tie; no mutable execution is shared with selection state.
export function mergeExecutionHistory(
  ...groups: readonly (readonly BalanceExecution[])[]
): BalanceExecution[] {
  const merged = new Map<string, BalanceExecution>();
  for (const group of groups)
    for (const item of group) {
      const previous = merged.get(item.requestId);
      if (
        !previous ||
        revision(item) > revision(previous) ||
        (revision(item) === revision(previous) && progress(item) >= progress(previous))
      )
        merged.set(item.requestId, item);
    }
  return [...merged.values()].sort(
    (a, b) => b.startedAt.localeCompare(a.startedAt) || a.requestId.localeCompare(b.requestId),
  );
}
export function executionAtm(item: BalanceExecution, catalog: CatalogSnapshot | undefined): string {
  return (
    item.correlation?.terminalId ??
    catalog?.atms.find((atm) => atm.id === item.atmId)?.alias ??
    'ATM no disponible'
  );
}
function normalized(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');
}
export function filterExecutionHistory(
  items: readonly BalanceExecution[],
  filters: HistoryFilters,
  catalog?: CatalogSnapshot,
): BalanceExecution[] {
  const query = normalized(filters.query);
  return items.filter(
    (item) =>
      (!filters.atmId || item.atmId === filters.atmId) &&
      (filters.outcome === 'all' || executionCategory(item) === filters.outcome) &&
      (!query ||
        normalized(
          [
            item.deposit ? 'Depósito' : item.withdrawal ? 'Retiro' : 'Consulta de saldo',
            executionOutcomeLabel(item),
            executionAtm(item, catalog),
            catalog?.atms.find((atm) => atm.id === item.atmId)?.alias ?? '',
            item.deposit?.amount ?? item.withdrawal?.amount ?? '',
            item.requestId,
            item.transactionId,
            item.runId,
            item.correlation?.stan ?? '',
            item.correlation?.rrn ?? '',
          ].join(' '),
        ).includes(query)),
  );
}
// This is a projection of recorded evidence, not a timer-driven simulation or
// an inferred path through the remote switch/Core. No stage duration is invented.
export function executionStages(item: BalanceExecution, persisted: boolean): ExecutionStage[] {
  const finished = item.finishedAt !== null;
  const response =
    !!item.messages?.response ||
    (!!item.responseCode &&
      !!item.correlation &&
      ['APPROVED', 'NOT_APPROVED', 'REQUIRES_REVIEW'].includes(item.outcome));
  const stages: ExecutionStage[] = [
    {
      id: 'preparation',
      label: 'Preparación',
      state: item.frameGenerated ? 'complete' : finished ? 'attention' : 'pending',
      detail: item.frameGenerated
        ? 'Trama generada con el contexto de esta operación.'
        : finished
          ? 'No se generó una trama. Revisa las dependencias y el resultado del intento.'
          : 'Todavía no hay evidencia de una trama generada.',
      message: 'request',
    },
    {
      id: 'send',
      label: 'Envío',
      state:
        item.bytesQueued > 0
          ? 'complete'
          : item.transmissionAttempted
            ? 'attention'
            : finished
              ? 'unavailable'
              : 'pending',
      detail:
        item.bytesQueued > 0
          ? `${item.bytesQueued} bytes entregados al transporte. Esto no confirma su recepción por el host.`
          : item.transmissionAttempted
            ? 'Hubo un intento de envío, sin bytes confirmados por el transporte.'
            : 'No hay evidencia de transmisión.',
      message: 'request',
    },
    {
      id: 'response',
      label: 'Respuesta',
      state: response ? 'complete' : finished ? 'attention' : 'pending',
      detail: response
        ? `Respuesta del host registrada · código ${item.responseCode ?? 'no informado'}.`
        : finished
          ? 'No hay una respuesta válida y correlacionada registrada.'
          : 'Esperando evidencia de respuesta.',
      message: 'response',
    },
    {
      id: 'validation',
      label: 'Validación',
      state: response
        ? item.outcome === 'REQUIRES_REVIEW'
          ? 'attention'
          : 'complete'
        : finished
          ? 'unavailable'
          : 'pending',
      detail: response
        ? item.outcome === 'REQUIRES_REVIEW'
          ? 'La respuesta está correlacionada, pero requiere revisión del resultado.'
          : 'Respuesta correlacionada con esta solicitud. No certifica débito ni dispensación.'
        : 'Sin respuesta correlacionada para validar.',
    },
  ];
  if (item.reversal) {
    const reversal = item.reversal;
    stages.push({
      id: 'reversal',
      label: 'Reverso',
      state:
        reversal.outcome === 'APPROVED'
          ? 'complete'
          : reversal.finishedAt
            ? 'attention'
            : 'pending',
      detail:
        reversalOutcomeLabels[reversal.outcome] +
        (reversal.responseCode ? ` · código ${reversal.responseCode}` : '') +
        '. La autorización del retiro se conserva por separado.',
      message: reversal.messages?.response ? 'reversal-response' : 'reversal-request',
    });
  }
  stages.push({
    id: 'record',
    label: 'Registro',
    state: item.outcome === 'STORAGE_ERROR' ? 'attention' : persisted ? 'complete' : 'pending',
    detail:
      item.outcome === 'STORAGE_ERROR'
        ? 'El guardado no está confirmado. Conserva la referencia y recupera el resultado.'
        : persisted
          ? 'Esta versión fue recuperada del diario local.'
          : 'Esta versión está disponible en la sesión; su guardado aún no se ha verificado en el historial.',
  });
  return stages;
}
