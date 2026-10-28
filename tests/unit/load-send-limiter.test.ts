import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import { LoadSendLimiter } from '../../apps/desktop/src/main/infrastructure/load-send-limiter';
import { randomUUID } from 'node:crypto';
import type { LoadTestDraft } from '../../packages/domain/src/load-test';
const plan: LoadTestDraft = {
  environment: 'QA',
  operation: 'BALANCE',
  mode: 'LOAD',
  atmId: randomUUID(),
  atmRevision: 1,
  targetTps: 5,
  concurrency: 3,
  maxTransactions: 3,
  durationSeconds: 3,
  rampUpSeconds: 0,
};

it('serializa permisos TPS de sockets simultáneos sin recuperar créditos tras validación lenta', async () => {
  const limiter = new LoadSendLimiter(plan);
  const starts: number[] = [];
  const signal = new AbortController().signal;
  const deadline = performance.now() + 3000;
  await Promise.all(
    [0, 1, 2].map((index) =>
      limiter.send(signal, deadline, async () => {
        if (index === 0) await new Promise((resolve) => setTimeout(resolve, 300));
        starts.push(performance.now());
      }),
    ),
  );
  expect(starts).toHaveLength(3);
  for (let i = 1; i < starts.length; i++)
    expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(195);
});

it('no escribe después de cancelar o agotar el plazo mientras espera permiso', async () => {
  const limiter = new LoadSendLimiter(plan);
  const signal = new AbortController().signal;
  let writes = 0;
  const write = async () => {
    writes++;
  };
  await limiter.send(signal, performance.now() + 3000, write);
  const abort = new AbortController();
  const cancelled = limiter.send(abort.signal, performance.now() + 3000, write);
  const rejected = expect(cancelled).rejects.toThrow('CONTEXT_CHANGED');
  abort.abort();
  await rejected;
  await expect(limiter.send(signal, performance.now() + 30, write)).rejects.toThrow(
    'CONTEXT_CHANGED',
  );
  expect(writes).toBe(1);
});
