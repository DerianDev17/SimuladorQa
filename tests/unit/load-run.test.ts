import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { parseLoadRunRequest, loadRunMetrics } from '../../packages/domain/src/load-run';
import { LoadPinSession } from '../../apps/desktop/src/main/adapters/load-pin-session';

export const loadRequest = () => ({
  requestId: randomUUID(),
  cardReadId: randomUUID(),
  draft: {
    environment: 'QA' as const,
    operation: 'BALANCE' as const,
    mode: 'LOAD' as const,
    atmId: randomUUID(),
    atmRevision: 1,
    targetTps: 5,
    concurrency: 1,
    maxTransactions: 3,
    durationSeconds: 10,
    rampUpSeconds: 0,
  },
});
describe('corrida QA acotada', () => {
  it('respeta el mínimo de la UI y rechaza tasas que desbordan el temporizador', () => {
    const request = loadRequest();
    expect(
      parseLoadRunRequest({ ...request, draft: { ...request.draft, targetTps: 0.1 } }),
    ).toBeDefined();
    for (const targetTps of [0.09, 1e-10, NaN, Infinity, 0, -1])
      expect(
        parseLoadRunRequest({ ...request, draft: { ...request.draft, targetTps } }),
      ).toBeUndefined();
  });
  it('valida límites, fuente, ambiente y rampa sin aceptar secretos', () => {
    const request = loadRequest();
    expect(parseLoadRunRequest(request)).toEqual(request);
    for (const override of [
      { targetTps: 6 },
      { concurrency: 2 },
      { maxTransactions: 101 },
      { durationSeconds: 301 },
      { environment: 'PREPROD' },
      { rampUpSeconds: 10 },
    ])
      expect(
        parseLoadRunRequest({ ...request, draft: { ...request.draft, ...override } }),
      ).toBeUndefined();
    expect(parseLoadRunRequest({ ...request, pin: 'secret' })).toBeUndefined();
    expect(parseLoadRunRequest({ ...request, cardReadId: 'invalid' })).toBeUndefined();
  });
  it('calcula métricas de respuestas sin contar errores previos como envíos', () => {
    const run = {
      runId: randomUUID(),
      requestId: randomUUID(),
      draft: loadRequest().draft,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      state: 'RUNNING' as const,
      message: '',
      active: 0,
      elapsedMs: 2000,
      items: [100, 200, 300].map((elapsedMs) => ({
        requestId: randomUUID(),
        transactionId: randomUUID(),
        outcome: 'APPROVED' as const,
        sent: true,
        received: true,
        elapsedMs,
        responseCode: '00',
        correlation: null,
      })),
    };
    expect(loadRunMetrics(run)).toMatchObject({
      sent: 3,
      received: 3,
      tps: 1.5,
      p50: 200,
      p95: 300,
      p99: 300,
      avg: 200,
    });
  });
});
describe('PIN limitado a la corrida', () => {
  it('pide una vez, devuelve copias independientes y borra al cerrar', async () => {
    const original = Uint8Array.of(1, 2, 3, 4);
    const request = vi.fn(async () => original);
    const session = new LoadPinSession({ request });
    session.begin();
    const first = await session.request(new AbortController().signal);
    first!.fill(0);
    expect(await session.request(new AbortController().signal)).toEqual(Uint8Array.of(1, 2, 3, 4));
    expect(request).toHaveBeenCalledTimes(1);
    session.end();
    expect(original).toEqual(new Uint8Array(4));
  });
  it('descarta una respuesta tardía tras cancelar y conserva el modo individual fuera de carga', async () => {
    let resolve!: (pin: Uint8Array) => void;
    const session = new LoadPinSession({
      request: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    session.begin();
    const pending = session.request(new AbortController().signal);
    session.end();
    const late = Uint8Array.of(1, 2, 3, 4);
    resolve(late);
    await expect(pending).rejects.toThrow('QA_PIN_CANCELLED');
    expect(late).toEqual(new Uint8Array(4));
    const delegate = vi.fn(async () => null);
    expect(
      await new LoadPinSession({ request: delegate }).request(new AbortController().signal),
    ).toBeNull();
    expect(delegate).toHaveBeenCalledOnce();
  });
});
