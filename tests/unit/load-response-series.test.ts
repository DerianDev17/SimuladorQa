import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  loadResponseSeries,
  loadRunMetrics,
  type LoadRunSnapshot,
} from '../../packages/domain/src/load-run';
import { loadTargetTps } from '../../packages/domain/src/load-test';

function snapshot(): LoadRunSnapshot {
  const startedAt = '2026-10-27T12:00:00.000Z';
  return {
    runId: randomUUID(),
    requestId: randomUUID(),
    startedAt,
    finishedAt: null,
    state: 'RUNNING',
    active: 1,
    elapsedMs: 5000,
    message: '',
    draft: {
      environment: 'QA',
      operation: 'BALANCE',
      mode: 'LOAD',
      atmId: randomUUID(),
      atmRevision: 1,
      targetTps: 5,
      concurrency: 1,
      maxTransactions: 100,
      durationSeconds: 60,
      rampUpSeconds: 0,
    },
    items: [1000, 2000].map((ms) => ({
      requestId: randomUUID(),
      transactionId: randomUUID(),
      outcome: 'APPROVED',
      sent: true,
      received: true,
      responseCode: '00',
      elapsedMs: 100,
      correlation: null,
      finishedAt: new Date(Date.parse(startedAt) + ms).toISOString(),
    })),
  };
}

describe('métricas y serie de carga/estrés', () => {
  it('distingue respuestas, envíos sin respuesta y fallos locales, sin dibujar el futuro', () => {
    const run = snapshot();
    run.items.push(
      {
        ...run.items[0]!,
        outcome: 'RESPONSE_TIMEOUT',
        received: false,
        responseCode: null,
        elapsedMs: 3000,
      },
      {
        ...run.items[0]!,
        outcome: 'CONTEXT_ERROR',
        sent: false,
        received: false,
        responseCode: null,
      },
    );
    expect(loadRunMetrics(run)).toMatchObject({
      sent: 3,
      received: 2,
      approved: 2,
      timeouts: 1,
      errors: 2,
      tps: 0.6,
      min: 100,
      max: 100,
      p50: 100,
      p90: 100,
      p99: 100,
    });
    const series = loadResponseSeries(run);
    expect(series.at(-1)).toEqual({ elapsedMs: 5000, tps: 0.4 });
    expect(series.every((point) => point.elapsedMs <= run.elapsedMs)).toBe(true);
  });
  it('omite fechas ausentes o inválidas y acota la ventana a diez segundos', () => {
    const run = snapshot();
    run.elapsedMs = 12000;
    const undated = { ...run.items[0]! };
    delete undated.finishedAt;
    run.items.push(
      undated,
      { ...run.items[0]!, finishedAt: 'invalid' },
      { ...run.items[0]!, finishedAt: '2026-10-27T12:00:13.000Z' },
      { ...run.items[0]!, finishedAt: '2026-10-27T12:00:12.000Z' },
    );
    expect(loadResponseSeries(run).at(-1)).toEqual({ elapsedMs: 12000, tps: 0.1 });
  });
  it('el objetivo del gráfico usa la misma rampa acotada que el worker', () => {
    const plan = snapshot().draft;
    expect(loadTargetTps(plan, 0)).toBe(5);
    plan.mode = 'STRESS';
    plan.rampUpSeconds = 10;
    expect([0, 5000, 10000, 20000].map((ms) => loadTargetTps(plan, ms))).toEqual([1, 2.5, 5, 5]);
    plan.targetTps = 0.1;
    expect(loadTargetTps(plan, 0)).toBe(0.1);
    expect(loadTargetTps(plan, 20000)).toBe(0.1);
  });
});
