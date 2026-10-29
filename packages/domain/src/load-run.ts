import { isUuid } from './catalogs';
import { isRecord } from './index';
import { LOAD_TEST_LOCAL_MIN_TPS, parseLoadTestDraft, loadTestAtms } from './load-test';
import type { LoadTestDraft } from './load-test';
import type { BalanceExecution } from './balance-inquiry';

// Local pilot limits, not a statement of switch capacity.
export const LOAD_RUN_MAX_OPERATIONS = 100;
export const LOAD_RUN_MAX_SECONDS = 300;
export const LOAD_RUN_MAX_CONCURRENCY = 5;
export interface LoadRunRequest {
  requestId: string;
  cardReadId: string;
  draft: LoadTestDraft;
}
export type LoadRunState =
  'RUNNING' | 'STOPPING' | 'COMPLETED' | 'STOPPED' | 'FAILED' | 'INTERRUPTED';
export interface LoadRunItem {
  requestId: string;
  atmId?: string;
  transactionId: string | null;
  outcome: BalanceExecution['outcome'];
  sent: boolean;
  received: boolean;
  elapsedMs: number;
  responseCode: string | null;
  correlation: BalanceExecution['correlation'];
  finishedAt?: string;
  // Monotonic offset within the run; UTC remains available for correlation.
  finishedElapsedMs?: number;
  timings?: LoadRunTimings;
  // Explicit local cancellation; historical outcomes are not reclassified.
  cancelled?: true;
}
export interface LoadRunTimings {
  queueWaitMs?: number;
  rateLimitMs?: number;
  connectionWaitMs?: number;
  cardReadMs: number;
  inspectMs: number;
  contextMs: number;
  validationMs: number;
  journalMs: number;
  transportMs: number;
  otherMs: number;
  totalMs: number;
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
    draft.targetTps < LOAD_TEST_LOCAL_MIN_TPS ||
    draft.concurrency > LOAD_RUN_MAX_CONCURRENCY ||
    draft.maxTransactions < loadTestAtms(draft).length ||
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
    errors: run.items.filter(
      (item) => !item.cancelled && !['APPROVED', 'NOT_APPROVED'].includes(item.outcome),
    ).length,
    cancelled: run.items.filter((item) => item.cancelled).length,
    unconfirmed: run.items.filter((item) => item.sent && !item.received).length,
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

// Completion is a scheduling outcome, not proof of the requested throughput.
// A stress ramp has variable targets and cannot be judged against its peak.
export function loadRunBelowTarget(run: LoadRunSnapshot): boolean {
  return (
    run.state === 'COMPLETED' &&
    run.draft.mode === 'LOAD' &&
    loadRunMetrics(run).tps < run.draft.targetTps
  );
}

// A completed send without a response must never appear in the response curve.
// Omit the future part of a live run instead of plotting invented zeroes.
export function loadResponseSeries(run: LoadRunSnapshot) {
  const start = Date.parse(run.startedAt);
  const events = run.items
    .filter((item) => item.received && (item.finishedElapsedMs !== undefined || item.finishedAt))
    .map((item) => item.finishedElapsedMs ?? Date.parse(item.finishedAt!) - start)
    .filter((time) => Number.isFinite(time) && time >= 0 && time <= run.elapsedMs);
  return Array.from({ length: 41 }, (_, index) => {
    const elapsedMs = (run.elapsedMs * index) / 40;
    const from = Math.max(0, elapsedMs - 10000);
    const span = Math.max(1000, elapsedMs - from);
    const count = events.filter(
      (time) => time <= elapsedMs && (from === 0 ? time >= 0 : time > from),
    ).length;
    return { elapsedMs, tps: (count * 1000) / span };
  });
}
