import { performance } from 'node:perf_hooks';
import { isUuid } from '../../../../packages/domain/src/catalogs';
import { isRecord } from '../../../../packages/domain/src/index';
import { parseLoadRunRequest } from '../../../../packages/domain/src/load-run';
import { loadTestAtms } from '../../../../packages/domain/src/load-test';
import type {
  LoadRunRequest,
  LoadRunSnapshot,
  LoadRunItem,
  LoadRunTimings,
} from '../../../../packages/domain/src/load-run';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import { balanceDeliveryUncertain } from '../../../../packages/domain/src/balance-inquiry';
import { failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';
import type { RuntimeIdentity } from './ports';

export type LoadExecutionResult = Result<BalanceExecution & { loadTimings?: LoadRunTimings }> & {
  skipped?: 'DURATION';
  cancelled?: true;
};
export interface LoadRunSource {
  readerName: string;
  execute(
    signal: AbortSignal,
    runId: string,
    slot?: { index: number; deadline: number },
  ): Promise<LoadExecutionResult>;
  close(): void;
}
export interface LoadRunDriver {
  prepare(request: LoadRunRequest): Promise<Result<LoadRunSource>>;
}
export interface LoadRunStore {
  read(): Promise<LoadRunSnapshot | null>;
  hasRequest(id: string): Promise<boolean>;
  write(snapshot: LoadRunSnapshot): Promise<void>;
}
export interface LoadSchedule {
  started?(operationStartedAt: number, ticket?: number): void;
  next(operationStartedAt?: number, ticket?: number): void;
  stop(): void;
}
export type LoadScheduler = (
  request: LoadRunRequest,
  tick: (ticket?: number) => void,
  done: (reason: 'COUNT' | 'DURATION' | 'STOP' | 'ERROR') => void,
  startedAt?: number,
) => LoadSchedule;

export class LoadRunService {
  private run: LoadRunSnapshot | null = null;
  private busy = false;
  private started = 0;
  private launched = 0;
  private source: LoadRunSource | undefined;
  private scheduler: LoadSchedule | undefined;
  private abort: AbortController | undefined;
  private finishReason: 'COMPLETED' | 'STOPPED' | 'FAILED' | undefined;
  private failureRecorded = false;
  private writes: Promise<void> = Promise.resolve();
  private finishing = false;
  private closing = false;
  private idle: Promise<void> = Promise.resolve();
  private resolveIdle: (() => void) | undefined;
  private durationDrainTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly identity: RuntimeIdentity,
    private readonly driver: LoadRunDriver,
    private readonly store: LoadRunStore,
    private readonly schedule: LoadScheduler,
    private readonly durationDrainMs = 35_000,
  ) {}

  private releaseSource(): void {
    const source = this.source;
    this.source = undefined;
    source?.close();
  }
  isBusy(): boolean {
    return this.busy;
  }
  whenIdle(): Promise<void> {
    return this.idle;
  }
  private markIdle(): void {
    this.busy = false;
    this.resolveIdle?.();
    this.resolveIdle = undefined;
  }
  private drainDuration(): void {
    if (!this.run?.active || this.durationDrainTimer || this.finishReason !== 'COMPLETED') return;
    this.run.message = 'Tiempo alcanzado. Esperando las operaciones en curso.';
    this.durationDrainTimer = setTimeout(() => {
      if (!this.busy || !this.run?.active || this.finishReason !== 'COMPLETED') return;
      this.finishReason = 'FAILED';
      this.run.message =
        'Las operaciones en curso no terminaron durante el cierre. Revisa su correlación.';
      this.abort?.abort();
      this.releaseSource();
    }, this.durationDrainMs);
  }
  observeReaders(readers: readonly { name: string; state: string }[] | null): void {
    if (
      this.busy &&
      this.run &&
      this.source &&
      !readers?.some(
        (reader) => reader.name === this.source!.readerName && reader.state === 'CARD_PRESENT',
      )
    )
      this.stop({ runId: this.run.runId });
  }
  private snapshot(): LoadRunSnapshot | null {
    if (!this.run) return null;
    return structuredClone({
      ...this.run,
      elapsedMs:
        this.busy && ['RUNNING', 'STOPPING'].includes(this.run.state)
          ? Math.round(performance.now() - this.started)
          : this.run.elapsedMs,
    });
  }
  private persist(): Promise<void> {
    const snapshot = this.snapshot();
    if (!snapshot) return Promise.resolve();
    this.writes = this.writes.catch(() => undefined).then(() => this.store.write(snapshot));
    return this.writes;
  }
  async current(payload: unknown): Promise<Result<LoadRunSnapshot | null>> {
    if (payload !== undefined) return failure('VALIDATION_ERROR', 'Solicitud inválida.');
    try {
      if (!this.run && !this.busy) {
        const stored = await this.store.read();
        // An IPC start may have acquired the run while the file read was pending.
        if (this.busy || this.run) return { ok: true, value: this.snapshot() };
        this.run = stored;
        if (this.run && ['RUNNING', 'STOPPING'].includes(this.run.state)) {
          this.run.state = 'INTERRUPTED';
          this.run.active = 0;
          this.run.finishedAt = this.identity.now();
          this.run.message =
            'La aplicación se cerró durante la corrida. Revisa el historial; no se reanudará ni se repetirá ningún envío.';
          await this.persist();
        }
      }
      return { ok: true, value: this.snapshot() };
    } catch {
      return failure('STORAGE_UNAVAILABLE', 'No se pudo recuperar el registro de carga.');
    }
  }
  async start(payload: unknown): Promise<Result<LoadRunSnapshot>> {
    if (this.closing) return failure('SERVICE_UNAVAILABLE', 'La aplicación se está cerrando.');
    const request = parseLoadRunRequest(payload);
    if (!request)
      return failure(
        'VALIDATION_ERROR',
        'Usa QA, saldo, de 1 a 5 operaciones simultáneas, hasta 5 TPS, 100 consultas y 300 segundos.',
      );
    if (this.busy) return failure('CONFLICT', 'Ya hay una corrida activa.');
    this.busy = true;
    this.idle = new Promise<void>((resolve) => {
      this.resolveIdle = resolve;
    });
    try {
      const previous = this.run ?? (await this.store.read());
      if (await this.store.hasRequest(request.requestId))
        return failure(
          'CONFLICT',
          'Esta solicitud ya fue registrada. Consulta el resultado sin repetirla.',
        );
      if (previous && ['RUNNING', 'STOPPING'].includes(previous.state))
        return failure(
          'CONFLICT',
          'Hay una corrida interrumpida. Revisa su historial antes de preparar otra.',
        );
      if (this.closing) return failure('SERVICE_UNAVAILABLE', 'La aplicación se está cerrando.');
      const prepared = await this.driver.prepare(structuredClone(request));
      if (!prepared.ok) return prepared;
      if (this.closing) {
        prepared.value.close();
        return failure('SERVICE_UNAVAILABLE', 'La aplicación se está cerrando.');
      }
      this.source = prepared.value;
      this.abort = new AbortController();
      this.finishReason = undefined;
      this.failureRecorded = false;
      this.finishing = false;
      // Preflight has not started a run. Once accepted, persistence, worker
      // startup, PIN and execution all share this monotonic time budget.
      this.started = performance.now();
      this.launched = 0;
      this.run = {
        runId: this.identity.uuid(),
        requestId: request.requestId,
        draft: structuredClone(request.draft),
        startedAt: this.identity.now(),
        finishedAt: null,
        state: 'RUNNING',
        message: 'Consultas de saldo con tarjeta física. PIN una vez por corrida.',
        active: 0,
        items: [],
        elapsedMs: 0,
      };
      await this.persist();
      if (this.closing) {
        this.finishReason = 'STOPPED';
        await this.finish();
        return failure('SERVICE_UNAVAILABLE', 'La aplicación se está cerrando.');
      }
      // A stop/reader event can arrive while the initial snapshot is being
      // persisted, before there is a scheduler to receive the stop message.
      if (this.finishReason) {
        await this.finish();
        return { ok: true, value: this.snapshot()! };
      }
      this.scheduler = this.schedule(
        request,
        (ticket) => void this.tick(ticket),
        (reason) => {
          if (!this.busy) return;
          this.finishReason ??=
            reason === 'ERROR' ? 'FAILED' : reason === 'STOP' ? 'STOPPED' : 'COMPLETED';
          if (reason === 'ERROR')
            this.run!.message = 'El worker de carga dejó de estar disponible.';
          if (reason === 'ERROR') {
            this.abort?.abort();
            this.releaseSource();
          }
          if (reason === 'DURATION') this.drainDuration();
          if (!this.run!.active) void this.finish();
        },
        performance.timeOrigin + this.started,
      );
      return { ok: true, value: this.snapshot()! };
    } catch {
      if (this.run?.requestId === request.requestId && this.run.state === 'RUNNING') {
        this.run.state = 'FAILED';
        this.run.finishedAt = this.identity.now();
        this.run.elapsedMs = Math.round(performance.now() - this.started);
        this.run.message = 'El inicio falló antes de activar el worker. No se inició la carga.';
        try {
          await this.persist();
        } catch {
          /* The financial journal remains authoritative. */
        }
      }
      return failure('STORAGE_UNAVAILABLE', 'No se pudo iniciar ni registrar la corrida.');
    } finally {
      if (!this.scheduler) {
        this.releaseSource();
        this.source = undefined;
        this.markIdle();
      }
    }
  }
  stop(payload: unknown): Result<LoadRunSnapshot | null> {
    if (
      !isRecord(payload) ||
      Object.keys(payload).length !== 1 ||
      !isUuid(payload.runId) ||
      payload.runId !== this.run?.runId
    )
      return failure('VALIDATION_ERROR', 'Selecciona la corrida activa.');
    if (this.busy && !this.finishing && ['RUNNING', 'STOPPING'].includes(this.run.state)) {
      clearTimeout(this.durationDrainTimer);
      this.durationDrainTimer = undefined;
      if (this.finishReason !== 'FAILED') {
        this.finishReason = 'STOPPED';
        this.run.message = 'Deteniendo envíos y cerrando la operación en curso.';
      }
      this.run.state = 'STOPPING';
      this.abort?.abort();
      this.releaseSource();
      this.scheduler?.stop();
    }
    return { ok: true, value: this.snapshot() };
  }
  close(): void {
    this.closing = true;
    if (this.run && this.busy && this.scheduler) this.stop({ runId: this.run.runId });
  }
  private async tick(ticket?: number): Promise<void> {
    if (
      !this.run ||
      !this.busy ||
      this.run.active >= this.run.draft.concurrency ||
      this.finishReason ||
      this.launched >= this.run.draft.maxTransactions
    )
      return;
    // A tick may have been posted on time but reached a busy Main after the
    // deadline. The worker's duration event will close the run without a send.
    if (performance.now() - this.started >= this.run.draft.durationSeconds * 1000) return;
    const operationStartedAt = performance.timeOrigin + performance.now();
    const atms = loadTestAtms(this.run.draft);
    const index = this.launched++;
    const scheduledAtm = atms[index % atms.length]!;
    this.run.active++;
    this.scheduler?.started?.(operationStartedAt, ticket);
    try {
      const result = await this.source!.execute(this.abort!.signal, this.run.runId, {
        index,
        deadline: this.started + this.run.draft.durationSeconds * 1000,
      });
      if (result.skipped === 'DURATION') {
        this.finishReason ??= 'COMPLETED';
        this.drainDuration();
        return;
      }
      let item: LoadRunItem;
      if (result.ok) {
        const value = result.value;
        item = {
          requestId: value.requestId,
          atmId: value.atmId,
          transactionId: value.transactionId,
          outcome: value.outcome,
          sent: value.bytesQueued > 0,
          received: value.responseCode !== null,
          elapsedMs: value.elapsedMs,
          responseCode: value.responseCode,
          correlation: value.correlation,
          finishedAt: this.identity.now(),
          finishedElapsedMs: Math.round(performance.now() - this.started),
          ...(value.loadTimings ? { timings: value.loadTimings } : {}),
        };
        if (balanceDeliveryUncertain(value) && !this.failureRecorded && !result.cancelled) {
          this.finishReason = 'FAILED';
          this.failureRecorded = true;
          this.run.message = `Primer error: ${value.outcome}${value.correlation ? ` · STAN ${value.correlation.stan}` : ''}. Envío sin respuesta confirmada; revisa su correlación. No se reintentará.`;
        } else if (
          value.outcome !== 'APPROVED' &&
          this.run.state !== 'STOPPING' &&
          !this.failureRecorded &&
          !result.cancelled
        ) {
          this.finishReason = 'FAILED';
          this.failureRecorded = true;
          this.run.message =
            value.blockers[0]?.label ??
            `Corrida detenida por resultado ${value.outcome}. No se reintenta.`;
        }
      } else {
        item = {
          requestId: this.identity.uuid(),
          atmId: scheduledAtm.atmId,
          transactionId: null,
          outcome: 'CONTEXT_ERROR',
          sent: false,
          received: false,
          elapsedMs: 0,
          responseCode: null,
          correlation: null,
          finishedAt: this.identity.now(),
          finishedElapsedMs: Math.round(performance.now() - this.started),
        };
        if (this.run.state !== 'STOPPING' && !this.failureRecorded && !result.cancelled) {
          this.finishReason = 'FAILED';
          this.failureRecorded = true;
          this.run.message = result.error.message;
        }
      }
      if (result.cancelled) {
        item.cancelled = true;
        this.finishReason ??= 'FAILED';
        if (item.sent && !item.received && !this.failureRecorded && this.run.state === 'STOPPING') {
          this.finishReason = 'FAILED';
          this.run.message =
            'Parada solicitada con un envío sin respuesta confirmada. Revisa su correlación; no se reintentará.';
        }
      }
      if (this.finishReason === 'FAILED') {
        this.abort?.abort();
        this.releaseSource();
      }
      this.run.items.push(item);
      await this.persist();
    } catch {
      this.finishReason = 'FAILED';
      this.run.message =
        'No se pudo completar o guardar el resultado. Revisa el historial antes de otra corrida.';
    } finally {
      this.run.active--;
      if (this.finishReason) {
        if (this.finishReason === 'FAILED') {
          this.abort?.abort();
          this.releaseSource();
        }
        this.scheduler?.stop();
        await this.finish();
      } else this.scheduler?.next(operationStartedAt, ticket);
    }
  }
  private async finish(): Promise<void> {
    if (!this.run || !this.busy || this.run.active || this.finishing) return;
    this.finishing = true;
    clearTimeout(this.durationDrainTimer);
    this.durationDrainTimer = undefined;
    this.run.state = this.finishReason ?? 'COMPLETED';
    this.run.finishedAt = this.identity.now();
    this.run.elapsedMs = Math.round(performance.now() - this.started);
    this.releaseSource();
    this.source = undefined;
    this.scheduler = undefined;
    // Retain busy until durable final state, so another run cannot race this write.
    try {
      await this.persist();
    } catch {
      this.run.state = 'FAILED';
      this.run.message = 'No se pudo guardar el cierre. Revisa el historial transaccional.';
    } finally {
      this.markIdle();
    }
  }
}
