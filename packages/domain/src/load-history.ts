import { isUuid, isUtcTimestamp } from './catalogs';
import { isRecord } from './index';
import { loadRunMetrics } from './load-run';
import type { LoadRunSnapshot, LoadRunState } from './load-run';
import type { LoadTestOperation } from './load-test';

export const LOAD_HISTORY_PAGE_SIZE = 20;
export const loadStateLabels: Record<LoadRunState, string> = {
  RUNNING: 'En ejecución',
  STOPPING: 'Deteniendo',
  COMPLETED: 'Completada',
  STOPPED: 'Detenida',
  FAILED: 'Fallida',
  INTERRUPTED: 'Interrumpida',
};
export interface LoadHistoryQuery {
  from?: string;
  to?: string;
  atmId?: string;
  operation?: LoadTestOperation;
  state?: LoadRunState;
  before?: number;
}
export interface LoadHistoryEntry {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  state: LoadRunState;
  draft: LoadRunSnapshot['draft'];
  metrics: ReturnType<typeof loadRunMetrics>;
}
export interface LoadHistoryPage {
  entries: LoadHistoryEntry[];
  next: number | null;
}
export function parseLoadHistoryQuery(value: unknown): LoadHistoryQuery | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => !['from', 'to', 'atmId', 'operation', 'state', 'before'].includes(key),
    )
  )
    return;
  if (value.from !== undefined && !isUtcTimestamp(value.from)) return;
  if (value.to !== undefined && !isUtcTimestamp(value.to)) return;
  if (value.from && value.to && Date.parse(String(value.from)) >= Date.parse(String(value.to)))
    return;
  if (value.atmId !== undefined && !isUuid(value.atmId)) return;
  if (
    value.operation !== undefined &&
    (typeof value.operation !== 'string' || !['BALANCE', 'WITHDRAWAL'].includes(value.operation))
  )
    return;
  if (
    value.state !== undefined &&
    (typeof value.state !== 'string' || !Object.hasOwn(loadStateLabels, value.state))
  )
    return;
  if (
    value.before !== undefined &&
    (!Number.isSafeInteger(value.before) || (value.before as number) < 1)
  )
    return;
  return { ...value } as LoadHistoryQuery;
}
export function parseLoadHistoryId(value: unknown): string | undefined {
  if (isRecord(value) && Object.keys(value).length === 1 && isUuid(value.runId)) return value.runId;
  return;
}
