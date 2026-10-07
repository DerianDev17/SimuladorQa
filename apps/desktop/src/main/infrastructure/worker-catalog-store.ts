import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type { CatalogStore } from '../catalog-port';
import type { CatalogSnapshot } from '../../../../../packages/domain/src/catalogs';
import type {
  CatalogCommand,
  CatalogContext,
  CatalogWorkerRequest,
  CatalogWorkerResponse,
} from '../../../../../packages/shared/src/catalog-worker';
import { failure } from '../../../../../packages/shared/src/contracts';
import type { Result } from '../../../../../packages/shared/src/contracts';

interface Pending {
  resolve(result: Result<CatalogSnapshot>): void;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkerCatalogStore implements CatalogStore {
  private worker: Worker | undefined;
  private termination: Promise<void> = Promise.resolve();
  private pending = new Map<string, Pending>();
  private closed = false;
  constructor(
    private readonly script: string,
    private readonly file: string,
    private readonly timeoutMs = 3_000,
  ) {}

  private stop(result: Result<never>): void {
    const worker = this.worker;
    this.worker = undefined;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve(result);
    }
    this.pending.clear();
    if (worker)
      this.termination = worker.terminate().then(
        () => undefined,
        () => undefined,
      );
  }

  async execute(
    command: CatalogCommand,
    context: CatalogContext,
  ): Promise<Result<CatalogSnapshot>> {
    await this.termination;
    if (this.closed)
      return failure('SERVICE_UNAVAILABLE', 'El servicio de catálogos está cerrado.');
    try {
      if (!this.worker) {
        const worker = new Worker(this.script, { workerData: { file: this.file } });
        this.worker = worker;
        worker.on('message', (response: CatalogWorkerResponse) => {
          if (this.worker !== worker) return;
          const pending = this.pending.get(response.id);
          if (pending) {
            clearTimeout(pending.timer);
            this.pending.delete(response.id);
            pending.resolve(response.result);
          }
        });
        const unavailable = () => {
          if (this.worker === worker)
            this.stop(
              failure(
                'STORAGE_UNAVAILABLE',
                'No se pudo abrir el catálogo local. Revisa su integridad y permisos.',
              ),
            );
        };
        worker.on('error', unavailable);
        worker.on('exit', unavailable);
      }
      const worker = this.worker;
      return await new Promise<Result<CatalogSnapshot>>((resolve) => {
        const id = randomUUID();
        const timer = setTimeout(
          () =>
            this.stop(
              failure(
                'TIMEOUT',
                'El catálogo no respondió. Recarga antes de reintentar para verificar si el cambio se guardó.',
              ),
            ),
          this.timeoutMs,
        );
        this.pending.set(id, { resolve, timer });
        const request: CatalogWorkerRequest = { id, command, context };
        try {
          worker.postMessage(request);
        } catch {
          this.stop(
            failure('SERVICE_UNAVAILABLE', 'No se pudo contactar al servicio de catálogos.'),
          );
        }
      });
    } catch {
      return failure('SERVICE_UNAVAILABLE', 'No se pudo iniciar el servicio de catálogos.');
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    this.stop(failure('SERVICE_UNAVAILABLE', 'El servicio de catálogos está cerrado.'));
    await this.termination;
  }
}
