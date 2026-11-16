import { randomUUID } from 'node:crypto';
import { historyRun } from './load-history';
import type { LoadRunSnapshot } from '../../packages/domain/src/load-run';

// Synthetic examples only: no card, host connection or production evidence.
export function loadReportExample(uncertain: boolean): LoadRunSnapshot {
  const run = historyRun({
    state: uncertain ? 'FAILED' : 'COMPLETED',
    elapsedMs: uncertain ? 25_000 : 6000,
    finishedAt: uncertain ? '2026-11-02T10:00:25.000Z' : '2026-11-02T10:00:06.000Z',
  });
  run.draft = {
    ...run.draft,
    targetTps: 3,
    concurrency: 3,
    maxTransactions: 12,
    durationSeconds: 30,
  };
  run.items = Array.from({ length: uncertain ? 6 : 12 }, (_, index) => {
    const timeout = uncertain && index === 5;
    const finishedElapsedMs = timeout ? 25_000 : (index + 1) * 500;
    return {
      requestId: randomUUID(),
      transactionId: randomUUID(),
      atmId: run.draft.atmId,
      outcome: timeout ? 'RESPONSE_TIMEOUT' : 'APPROVED',
      sent: true,
      received: !timeout,
      elapsedMs: timeout ? 20_000 : 80 + index * 15,
      responseCode: timeout ? null : '00',
      correlation: {
        stan: String(index + 1).padStart(6, '0'),
        rrn: String(index + 1).padStart(12, '0'),
        terminalId: 'DEMO-ATM',
      },
      finishedElapsedMs,
      finishedAt: new Date(Date.parse(run.startedAt) + finishedElapsedMs).toISOString(),
    };
  });
  return run;
}
