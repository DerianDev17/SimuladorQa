import { isUuid } from './catalogs';
import { isRecord } from './index';
import { parseLoadTestDraft } from './load-test';
import type { LoadTestDraft } from './load-test';
import type { BalanceExecution } from './balance-inquiry';

// Local pilot limits, not a statement of switch capacity.
export const LOAD_RUN_MAX_OPERATIONS = 100;
export const LOAD_RUN_MAX_SECONDS = 300;
export interface LoadRunRequest {
  requestId: string;
  cardReadId: string;
  draft: LoadTestDraft;
}
export type LoadRunState =
  'RUNNING' | 'STOPPING' | 'COMPLETED' | 'STOPPED' | 'FAILED' | 'INTERRUPTED';
export interface LoadRunItem {
  requestId: string;
  transactionId: string | null;
  outcome: BalanceExecution['outcome'];
  sent: boolean;
  received: boolean;
  elapsedMs: number;
  responseCode: string | null;
  correlation: BalanceExecution['correlation'];
}
export interface LoadRunSnapshot {
  runId: string;
  requestId: string;
  draft: LoadTestDraft;
  startedAt: string;
  finishedAt: string | null;
  state: LoadRunState;
  message: string;
  items: LoadRunItem[];
  active: number;
  elapsedMs: number;
}
export function parseLoadRunRequest(value: unknown): LoadRunRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !isUuid(value.requestId) ||
    !isUuid(value.cardReadId)
  )
    return;
  const draft = parseLoadTestDraft(value.draft);
  if (
    !draft ||
    draft.concurrency !== 1 ||
    draft.maxTransactions > LOAD_RUN_MAX_OPERATIONS ||
    draft.durationSeconds > LOAD_RUN_MAX_SECONDS ||
    draft.rampUpSeconds >= draft.durationSeconds
  )
    return;
  return { requestId: value.requestId, cardReadId: value.cardReadId, draft };
}
export function loadRunMetrics(run: LoadRunSnapshot) {
  const sent = run.items.filter((item) => item.sent).length;
  const received = run.items.filter((item) => item.received).length;
  const latencies = run.items
    .filter((item) => item.received)
    .map((item) => item.elapsedMs)
    .sort((a, b) => a - b);
  const percentile = (p: number) =>
    latencies.length ? latencies[Math.ceil(latencies.length * p) - 1]! : null;
  return {
    sent,
    received,
    approved: run.items.filter((item) => item.outcome === 'APPROVED').length,
    declined: run.items.filter((item) => item.outcome === 'NOT_APPROVED').length,
    timeouts: run.items.filter((item) =>
      ['CONNECT_TIMEOUT', 'RESPONSE_TIMEOUT'].includes(item.outcome),
    ).length,
    errors: run.items.filter((item) => !['APPROVED', 'NOT_APPROVED'].includes(item.outcome)).length,
    tps: run.elapsedMs > 0 ? (sent * 1000) / run.elapsedMs : 0,
    min: latencies[0] ?? null,
    max: latencies.at(-1) ?? null,
    avg: latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null,
    p50: percentile(0.5),
    p90: percentile(0.9),
    p95: percentile(0.95),
    p99: percentile(0.99),
  };
}
