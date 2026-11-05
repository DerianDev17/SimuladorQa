import { randomUUID } from 'node:crypto';
import type { LoadRunSnapshot } from '../../packages/domain/src/load-run';
export function historyRun(overrides: Partial<LoadRunSnapshot> = {}): LoadRunSnapshot {
  return {
    runId: randomUUID(),
    requestId: randomUUID(),
    draft: {
      environment: 'QA',
      operation: 'BALANCE',
      mode: 'LOAD',
      atmId: randomUUID(),
      atmRevision: 1,
      targetTps: 1,
      concurrency: 1,
      maxTransactions: 1,
      durationSeconds: 60,
      rampUpSeconds: 0,
    },
    startedAt: '2026-11-02T10:00:00.000Z',
    finishedAt: '2026-11-02T10:00:01.000Z',
    state: 'COMPLETED',
    message: 'Corrida completada.',
    active: 0,
    elapsedMs: 1000,
    items: [
      {
        requestId: randomUUID(),
        transactionId: randomUUID(),
        outcome: 'APPROVED',
        sent: true,
        received: true,
        elapsedMs: 100,
        responseCode: '00',
        correlation: { stan: '000123', rrn: '123'.padStart(12, '0'), terminalId: 'ATM00001' },
        finishedAt: '2026-11-02T10:00:01.000Z',
      },
    ],
    ...overrides,
  };
}
