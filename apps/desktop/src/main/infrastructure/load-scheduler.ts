import { Worker } from 'node:worker_threads';
import type { LoadScheduler } from '../load-run-service';
export function workerLoadScheduler(file: string): LoadScheduler {
  return (request, tick, done) => {
    const worker = new Worker(file, { workerData: request.draft });
    let ended = false;
    const finish = (reason: 'COUNT' | 'DURATION' | 'STOP' | 'ERROR') => {
      if (ended) return;
      ended = true;
      done(reason);
      void worker.terminate();
    };
    worker.on('message', (value: unknown) => {
      if (ended || !value || typeof value !== 'object') return;
      const message = value as { type?: unknown; reason?: unknown };
      if (message.type === 'tick') tick();
      else if (
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
      next: () => {
        if (!ended) worker.postMessage('next');
      },
      stop: () => {
        if (!ended) worker.postMessage('stop');
      },
    };
  };
}
