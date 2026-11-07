import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type {
  LoadHistoryPage,
  LoadHistoryQuery,
} from '../../../../../packages/domain/src/load-history';
import type { LoadRunSnapshot } from '../../../../../packages/domain/src/load-run';
import type { LoadHistoryStore } from '../load-history-ports';
import type { LoadRunStore } from '../load-ports';
import type {
  LoadStoreCommand,
  LoadStoreRequest,
  LoadStoreResponse,
  LoadStoreValue,
} from './load-store-protocol';

interface Pending {
  resolve(value: LoadStoreValue): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkerLoadRunStore implements LoadRunStore, LoadHistoryStore {
  private worker: Worker | undefined;
  private pending = new Map<string, Pending>();
  private failure: string | undefined;
  private closing: Promise<void> | undefined;
  private termination: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly script: string,
    private readonly file: string,
    private readonly legacy: string,
    private readonly timeoutMs = 10_000,
  ) {}

  private fail(code: string): void {
    this.failure ??= code;
    const worker = this.worker;
    this.worker = undefined;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error(code));
    }
    this.pending.clear();
    if (worker) this.termination = worker.terminate().catch(() => undefined);
  }

  private request<T extends LoadStoreValue>(command: LoadStoreCommand): Promise<T> {
    if (this.failure || this.closing)
      return Promise.reject(Error(this.failure ?? 'LOAD_STORE_CLOSED'));
    try {
      if (!this.worker) {
        const worker = new Worker(this.script, {
          workerData: { file: this.file, legacy: this.legacy },
        });
        this.worker = worker;
        worker.on('message', (response: LoadStoreResponse) => {
          const entry = this.pending.get(response.id);
          if (!entry) return;
          clearTimeout(entry.timer);
          this.pending.delete(response.id);
          if (response.ok) entry.resolve(response.value);
          else entry.reject(Error(response.code));
        });
        const unavailable = () => {
          if (this.worker === worker) this.fail('LOAD_STORE_UNAVAILABLE');
        };
        worker.on('error', unavailable);
        worker.on('exit', unavailable);
      }
      const worker = this.worker;
      return new Promise<T>((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => this.fail('LOAD_STORE_TIMEOUT'), this.timeoutMs);
        this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
        try {
          // Structured cloning happens before yielding: later caller mutations cannot alter a queued write.
          const request: LoadStoreRequest = { id, command };
          worker.postMessage(request);
        } catch {
          this.fail('LOAD_STORE_UNAVAILABLE');
        }
      });
    } catch {
      this.fail('LOAD_STORE_UNAVAILABLE');
      return Promise.reject(Error('LOAD_STORE_UNAVAILABLE'));
    }
  }

  read(): Promise<LoadRunSnapshot | null> {
    return this.request({ kind: 'read' });
  }
  get(id: string): Promise<LoadRunSnapshot | null> {
    return this.request({ kind: 'get', id });
  }
  list(query: LoadHistoryQuery): Promise<LoadHistoryPage> {
    return this.request({ kind: 'list', query });
  }
  hasRequest(id: string): Promise<boolean> {
    return this.request({ kind: 'hasRequest', id });
  }
  write(run: LoadRunSnapshot): Promise<void> {
    return this.request<undefined>({ kind: 'write', run });
  }

  close(): Promise<void> {
    if (!this.closing) {
      // Drain accepted operations before closing SQLite. Never replay a write after a timeout/crash.
      const drained =
        this.worker && !this.failure ? this.request({ kind: 'close' }) : Promise.resolve();
      this.closing = drained
        .finally(async () => {
          this.fail('LOAD_STORE_CLOSED');
          await this.termination;
        })
        .then(() => undefined);
    }
    return this.closing;
  }
}
