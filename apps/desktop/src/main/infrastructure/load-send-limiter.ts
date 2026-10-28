import { performance } from 'node:perf_hooks';
import { loadTargetTps } from '../../../../../packages/domain/src/load-test';
import type { LoadTestDraft } from '../../../../../packages/domain/src/load-test';

// One global gate across all connected sockets. No credits accumulate during
// preparation/network delays, and cancellation/deadline forbid late writes.
export class LoadSendLimiter {
  private last: number | undefined;
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly plan: LoadTestDraft) {}

  send(signal: AbortSignal, deadline: number, write: () => Promise<void>): Promise<void> {
    const wait = this.queue.then(async () => {
      await this.acquire(signal, deadline);
      try {
        await write();
      } finally {
        this.last = performance.now();
      }
    });
    this.queue = wait.catch(() => undefined);
    return wait;
  }

  private async acquire(signal: AbortSignal, deadline: number): Promise<void> {
    const start = deadline - this.plan.durationSeconds * 1000;
    while (true) {
      const now = performance.now();
      if (signal.aborted || now >= deadline) throw Error('CONTEXT_CHANGED');
      const interval = 1000 / loadTargetTps(this.plan, now - start);
      const delay = this.last === undefined ? 0 : this.last + interval - now;
      if (delay <= 0) {
        this.last = now;
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const cancel = () => {
          clearTimeout(timer);
          reject(Error('CONTEXT_CHANGED'));
        };
        const timer = setTimeout(
          () => {
            signal.removeEventListener('abort', cancel);
            resolve();
          },
          Math.min(delay, deadline - now),
        );
        signal.addEventListener('abort', cancel, { once: true });
        if (signal.aborted) cancel();
      });
    }
  }
}
