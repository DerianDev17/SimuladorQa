import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import type { LoadScheduler } from '../load-run-service';
export function workerLoadScheduler(file: string): LoadScheduler {
  return (request, tick, done, startedAt = performance.timeOrigin + performance.now()) => {
    const worker = new Worker(file, { workerData: { draft: request.draft, startedAt } });
    let ended = false;
    const pending = new Set<number>();
    const finish = (reason: 'COUNT' | 'DURATION' | 'STOP' | 'ERROR') => {
      if (ended) return;
      ended = true;
      done(reason);
      void worker.terminate();
    };
    worker.on('message', (value: unknown) => {
      if (ended || !value || typeof value !== 'object') return;
      const message = value as { type?: unknown; reason?: unknown; ticket?: unknown };
      if (message.type === 'tick' && typeof message.ticket === 'number') {
        pending.add(message.ticket);
        tick(message.ticket);
      } else if (
        message.type === 'done' &&
        ['COUNT', 'DURATION', 'STOP'].includes(String(message.reason))
      )
        finish(message.reason as 'COUNT' | 'DURATION' | 'STOP');
    });
    worker.once('error', () => finish('ERROR'));
    worker.once('exit', () => {
      if (!ended) finish('ERROR');
    });
    return {
      started: (operationStartedAt, ticket) => {
        if (!ended && ticket !== undefined && pending.has(ticket))
          worker.postMessage({ type: 'started', operationStartedAt, ticket });
      },
      next: (operationStartedAt, ticket = pending.values().next().value) => {
        if (!ended && ticket !== undefined && pending.delete(ticket))
          worker.postMessage({ type: 'next', operationStartedAt, ticket });
      },
      stop: () => {
        if (!ended) worker.postMessage('stop');
      },
    };
  };
}
