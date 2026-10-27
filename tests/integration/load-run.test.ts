import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LoadRunService, type LoadScheduler } from '../../apps/desktop/src/main/load-run-service';
import { workerLoadScheduler } from '../../apps/desktop/src/main/infrastructure/load-scheduler';
import { FileLoadRunStore } from '../../apps/desktop/src/main/infrastructure/load-run-store';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { removeTestDirectory } from '../helpers/temporary-directory';
import type { LoadRunSnapshot } from '../../packages/domain/src/load-run';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import type { Result } from '../../packages/shared/src/contracts';

const runtime = {
  agentId: randomUUID(),
  hostname: 'test',
  user: 'test',
  version: 'test',
  uuid: randomUUID,
  now: () => new Date().toISOString(),
};
const request = () => ({
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
const result = (): BalanceExecution => {
  const value = approvedWithdrawalExecution();
  delete value.withdrawal;
  return value;
};
let directory: string;
beforeAll(async () => {
  await mkdir('artifacts', { recursive: true });
  await build({
    entryPoints: ['apps/desktop/src/main/infrastructure/load-worker.ts'],
    outfile: 'artifacts/load-test-worker.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
  });
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-load-'));
});
afterEach(async () => {
  await removeTestDirectory(directory, 'coonecta-load-');
});
async function finished(service: LoadRunService): Promise<LoadRunSnapshot> {
  await vi.waitFor(() => expect(service.isBusy()).toBe(false), { timeout: 5000 });
  const snapshot = await service.current(undefined);
  if (!snapshot.ok || !snapshot.value) throw Error('NO_RESULT');
  return snapshot.value;
}
function setup(
  execute: (signal: AbortSignal, runId: string) => Promise<Result<BalanceExecution>>,
  durationDrainMs?: number,
) {
  const close = vi.fn();
  const store = new FileLoadRunStore(join(directory, 'runs.json'));
  const driver = {
    prepare: vi.fn(async () => ({
      ok: true as const,
      value: { readerName: 'Synthetic', execute, close },
    })),
  };
  return {
    service: new LoadRunService(
      runtime,
      driver,
      store,
      workerLoadScheduler(resolve('artifacts/load-test-worker.cjs')),
      durationDrainMs,
    ),
    store,
    close,
    driver,
  };
}
describe('worker de carga con persistencia real', () => {
  it('mide el intervalo desde el inicio real en Main y no recupera un tick entregado tarde con una ráfaga', async () => {
    const starts: number[] = [];
    let first = true;
    const realScheduler = workerLoadScheduler(resolve('artifacts/load-test-worker.cjs'));
    const delayedScheduler: LoadScheduler = (input, tick, done, startedAt) =>
      realScheduler(
        input,
        () => {
          if (first) {
            first = false;
            setTimeout(tick, 300);
          } else tick();
        },
        done,
        startedAt,
      );
    const service = new LoadRunService(
      runtime,
      {
        prepare: async () => ({
          ok: true,
          value: {
            readerName: 'Synthetic',
            close: () => {},
            execute: async () => {
              starts.push(performance.now());
              return { ok: true, value: result() };
            },
          },
        }),
      },
      new FileLoadRunStore(join(directory, 'runs.json')),
      delayedScheduler,
    );
    const input = request();
    input.draft.maxTransactions = 2;
    await service.start(input);
    await finished(service);
    expect(starts).toHaveLength(2);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(175);
  });
  it('ignora confirmaciones duplicadas sin acumular ticks ni superar el ritmo', async () => {
    const starts: number[] = [];
    const input = request();
    await new Promise<void>((resolveDone) => {
      const scheduler = workerLoadScheduler(resolve('artifacts/load-test-worker.cjs'))(
        input,
        () => {
          starts.push(performance.now());
          if (starts.length === 1) {
            scheduler.next();
            scheduler.next();
          } else if (starts.length === 2) setTimeout(() => scheduler.stop(), 250);
        },
        () => resolveDone(),
      );
    });
    expect(starts).toHaveLength(2);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(175);
  });
  it('detener después de un fallo del worker no oculta el fallo ni su diagnóstico', async () => {
    let tick!: () => void;
    let done!: Parameters<LoadScheduler>[2];
    let resolveOperation!: (value: Result<BalanceExecution>) => void;
    const service = new LoadRunService(
      runtime,
      {
        prepare: async () => ({
          ok: true,
          value: {
            readerName: 'Synthetic',
            close: () => {},
            execute: () =>
              new Promise((resolve) => {
                resolveOperation = resolve;
              }),
          },
        }),
      },
      new FileLoadRunStore(join(directory, 'runs.json')),
      (_request, onTick, onDone) => {
        tick = onTick;
        done = onDone;
        return { next: () => {}, stop: () => {} };
      },
    );
    const started = await service.start(request());
    if (!started.ok) throw Error('START');
    tick();
    done('ERROR');
    service.stop({ runId: started.value.runId });
    resolveOperation({ ok: true, value: result() });
    expect(await finished(service)).toMatchObject({
      state: 'FAILED',
      message: 'El worker de carga dejó de estar disponible.',
    });
  });
  it('la persistencia inicial y el arranque del worker no amplían el tiempo autorizado', async () => {
    const execute = vi.fn(async () => ({ ok: true as const, value: result() }));
    const { service, store } = setup(execute);
    const write = store.write.bind(store);
    vi.spyOn(store, 'write').mockImplementationOnce(async (snapshot) => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      await write(snapshot);
    });
    const input = request();
    input.draft.durationSeconds = 1;
    await service.start(input);
    expect((await finished(service)).state).toBe('COMPLETED');
    expect(execute).not.toHaveBeenCalled();
  });
  it('Main descarta un tick que llega después del plazo aunque el worker lo haya emitido antes', async () => {
    let tick!: () => void;
    let done!: Parameters<LoadScheduler>[2];
    const execute = vi.fn(async () => ({ ok: true as const, value: result() }));
    const service = new LoadRunService(
      runtime,
      {
        prepare: async () => ({
          ok: true,
          value: { readerName: 'Synthetic', close: () => {}, execute },
        }),
      },
      new FileLoadRunStore(join(directory, 'runs.json')),
      (_request, onTick, onDone) => {
        tick = onTick;
        done = onDone;
        return { next: () => {}, stop: () => {} };
      },
    );
    const input = request();
    input.draft.durationSeconds = 1;
    await service.start(input);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    tick();
    done('DURATION');
    expect((await finished(service)).state).toBe('COMPLETED');
    expect(execute).not.toHaveBeenCalled();
  });
  it('una parada durante la escritura final no convierte un resultado terminado en STOPPING', async () => {
    const execute = vi.fn(async () => ({ ok: true as const, value: result() }));
    const { service, store } = setup(execute);
    const write = store.write.bind(store);
    let release: (() => void) | undefined;
    vi.spyOn(store, 'write').mockImplementation(async (snapshot) => {
      if (snapshot.state === 'COMPLETED')
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      await write(snapshot);
    });
    const input = request();
    input.draft.maxTransactions = 1;
    const started = await service.start(input);
    if (!started.ok) throw Error('START');
    await vi.waitFor(() => expect(release).toBeDefined());
    try {
      expect(service.stop({ runId: started.value.runId })).toMatchObject({
        ok: true,
        value: { state: 'COMPLETED' },
      });
    } finally {
      release!();
      await service.whenIdle();
    }
    expect(await service.current(undefined)).toMatchObject({
      ok: true,
      value: { state: 'COMPLETED' },
    });
    expect((await store.read())?.state).toBe('COMPLETED');
    expect(execute).toHaveBeenCalledOnce();
  });
  it('preparar otra corrida conserva estado y tiempos de la anterior ante consultas o paradas tardías', async () => {
    const { service, driver } = setup(async () => ({ ok: true, value: result() }));
    await service.start(request());
    const previous = await finished(service);
    const source = await driver.prepare();
    let release: (() => void) | undefined;
    driver.prepare.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return source;
    });
    const starting = service.start(request());
    await vi.waitFor(() => expect(release).toBeDefined());
    try {
      expect(await service.current(undefined)).toEqual({ ok: true, value: previous });
      expect(service.stop({ runId: previous.runId })).toEqual({ ok: true, value: previous });
    } finally {
      release!();
      await starting;
      await finished(service);
    }
  });
  it('un temporizador retrasado del worker no inicia operaciones después del límite', async () => {
    const wrapper = join(directory, 'delayed-worker.cjs');
    await writeFile(
      wrapper,
      `
      const original = global.setTimeout;
      let delayed = false;
      global.setTimeout = (callback, delay, ...args) => original(() => {
        if (!delayed && delay === 0) {
          delayed = true;
          const end = performance.now() + 1100;
          while (performance.now() < end) {}
        }
        callback(...args);
      }, delay);
      require(${JSON.stringify(resolve('artifacts/load-test-worker.cjs'))});
    `,
    );
    const tick = vi.fn();
    const input = request();
    input.draft.durationSeconds = 1;
    await new Promise<void>((resolveDone) => {
      workerLoadScheduler(wrapper)(input, tick, (reason) => {
        expect(reason).toBe('DURATION');
        resolveDone();
      });
    });
    expect(tick).not.toHaveBeenCalled();
  });
  it('respeta el ritmo sin solapamiento, termina por cantidad y recupera la corrida sin secretos', async () => {
    const starts: number[] = [];
    let inFlight = 0;
    const { service, store, close } = setup(async (_signal, runId) => {
      starts.push(performance.now());
      inFlight++;
      expect(inFlight).toBe(1);
      await new Promise((done) => setTimeout(done, 40));
      inFlight--;
      return { ok: true, value: { ...result(), runId } };
    });
    const input = request();
    expect((await service.start(input)).ok).toBe(true);
    const run = await finished(service);
    expect(run.state).toBe('COMPLETED');
    expect(run.items).toHaveLength(3);
    expect(starts).toHaveLength(3);
    expect(starts.slice(1).every((start, index) => start - starts[index]! >= 175)).toBe(true);
    expect(close).toHaveBeenCalledOnce();
    expect((await store.read())?.runId).toBe(run.runId);
    expect(await service.start(input)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(await readFile(join(directory, 'runs.json'), 'utf8')).not.toMatch(
      /panMasked|pinBlock|cryptogram|cardReadId/i,
    );
  });
  it('detiene al primer rechazo, bloquea doble inicio y no reintenta', async () => {
    const execute = vi.fn(async () => ({
      ok: true as const,
      value: { ...result(), outcome: 'NOT_APPROVED' as const, responseCode: '05' },
    }));
    const { service } = setup(execute);
    await service.start(request());
    expect(await service.start(request())).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect((await finished(service)).state).toBe('FAILED');
    expect(execute).toHaveBeenCalledOnce();
  });
  it('completa operaciones lentas sin solaparlas ni reintentarlas', async () => {
    let inFlight = 0;
    const { service } = setup(async () => {
      inFlight++;
      expect(inFlight).toBe(1);
      await new Promise((done) => setTimeout(done, 350));
      inFlight--;
      return { ok: true, value: result() };
    });
    const input = request();
    input.draft.maxTransactions = 2;
    await service.start(input);
    const run = await finished(service);
    expect(run.state).toBe('COMPLETED');
    expect(run.items).toHaveLength(2);
  });
  it('cancelar aborta la consulta activa y marca incierto un envío sin respuesta', async () => {
    const execute = vi.fn(
      (signal: AbortSignal) =>
        new Promise<Result<BalanceExecution>>((done) => {
          signal.addEventListener(
            'abort',
            () =>
              done({
                ok: true,
                value: { ...result(), outcome: 'TRANSPORT_ERROR', responseCode: null },
              }),
            { once: true },
          );
        }),
    );
    const { service, close } = setup(execute);
    const started = await service.start(request());
    if (!started.ok) throw Error('START');
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(service.stop({ runId: started.value.runId }).ok).toBe(true);
    expect((await finished(service)).state).toBe('FAILED');
    expect(close).toHaveBeenCalled();
  });
  it.each([
    { readers: null },
    { readers: [] },
    { readers: [{ name: 'Synthetic', state: 'EMPTY' }] },
  ])(
    'retirar la tarjeta o perder el lector detiene la corrida y permite otra explícita: %j',
    async ({ readers }) => {
      const execute = vi.fn(
        (signal: AbortSignal) =>
          new Promise<Result<BalanceExecution>>((done) => {
            signal.addEventListener(
              'abort',
              () =>
                done({
                  ok: false,
                  error: { code: 'CONFLICT', message: 'Tarjeta retirada.' },
                }),
              { once: true },
            );
          }),
      );
      const { service, close } = setup(execute);
      await service.start(request());
      await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
      service.observeReaders(readers);
      expect((await finished(service)).state).toBe('STOPPED');
      expect(close).toHaveBeenCalledOnce();
      execute.mockResolvedValue({ ok: true, value: result() });
      expect((await service.start(request())).ok).toBe(true);
      expect((await finished(service)).state).toBe('COMPLETED');
    },
  );
  it('detener mientras se guarda el inicio nunca activa el worker ni deja la corrida bloqueada', async () => {
    const execute = vi.fn(async () => ({ ok: true as const, value: result() }));
    const { service, store, close } = setup(execute);
    const write = store.write.bind(store);
    let release: (() => void) | undefined;
    vi.spyOn(store, 'write').mockImplementationOnce(async (snapshot) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      await write(snapshot);
    });
    const starting = service.start(request());
    await vi.waitFor(() => expect(release).toBeDefined());
    const current = await service.current(undefined);
    if (!current.ok || !current.value) throw Error('NO_RUN');
    service.stop({ runId: current.value.runId });
    release!();
    expect(await starting).toMatchObject({ ok: true, value: { state: 'STOPPED' } });
    await service.whenIdle();
    expect(execute).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect((await store.read())?.state).toBe('STOPPED');
  });
  it('espera el cierre de la corrida y no arranca si se cierra durante la preparación', async () => {
    const { service, driver, store, close } = setup(async () => ({
      ok: true,
      value: result(),
    }));
    let releasePrepare: ((value: Awaited<ReturnType<typeof driver.prepare>>) => void) | undefined;
    driver.prepare.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePrepare = resolve;
        }),
    );
    const starting = service.start(request());
    await vi.waitFor(() => expect(releasePrepare).toBeDefined());
    const idle = service.whenIdle();
    service.close();
    releasePrepare!({
      ok: true,
      value: {
        readerName: 'Synthetic',
        execute: async () => ({ ok: true, value: result() }),
        close,
      },
    });
    expect(await starting).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    await idle;
    expect(service.isBusy()).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(await store.read()).toBeNull();
    expect(await service.start(request())).toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
  });
  it('el límite de duración espera la respuesta de la operación ya iniciada', async () => {
    const execute = vi.fn(async (signal: AbortSignal) => {
      await new Promise((done) => setTimeout(done, 1200));
      expect(signal.aborted).toBe(false);
      return { ok: true as const, value: result() };
    });
    const { service, close } = setup(execute);
    const input = request();
    input.draft.durationSeconds = 1;
    await service.start(input);
    const run = await finished(service);
    expect(run.state).toBe('COMPLETED');
    expect(run.items).toMatchObject([{ outcome: 'APPROVED', sent: true }]);
    expect(execute).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it('el cierre acotado cancela una dependencia que no responde y registra fallo', async () => {
    const { service, close } = setup(
      (signal) =>
        new Promise((done) =>
          signal.addEventListener(
            'abort',
            () => done({ ok: false, error: { code: 'TIMEOUT', message: 'Tiempo agotado.' } }),
            { once: true },
          ),
        ),
      100,
    );
    const input = request();
    input.draft.durationSeconds = 1;
    await service.start(input);
    const run = await finished(service);
    expect(run.state).toBe('FAILED');
    expect(run.items).toHaveLength(1);
    expect(close).toHaveBeenCalledOnce();
  });
  it('no inicia si la fuente o el almacenamiento faltan', async () => {
    const { service, driver, store } = setup(async () => ({ ok: true, value: result() }));
    vi.spyOn(store, 'read').mockRejectedValue(Error('private backend detail'));
    expect(await service.start(request())).toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE' },
    });
    expect(driver.prepare).not.toHaveBeenCalled();
    expect(service.isBusy()).toBe(false);
  });
  it('un fallo al registrar el inicio no deja una corrida aparente ni envía operaciones', async () => {
    const execute = vi.fn(async () => ({ ok: true as const, value: result() }));
    const { service, store, close } = setup(execute);
    vi.spyOn(store, 'write').mockRejectedValueOnce(Error('DISK_FAILURE'));
    expect(await service.start(request())).toMatchObject({ ok: false });
    expect(await service.current(undefined)).toMatchObject({
      ok: true,
      value: { state: 'FAILED' },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
    expect(service.isBusy()).toBe(false);
  });
  it('no abre el worker si la preparación del proveedor falla y aplica rampa sin ráfagas', async () => {
    const execute = vi.fn(async () => ({ ok: true as const, value: result() }));
    const { service, driver } = setup(execute);
    driver.prepare.mockRejectedValueOnce(Error('PRIVATE_DEPENDENCY_FAILURE'));
    expect(await service.start(request())).toMatchObject({ ok: false });
    expect(execute).not.toHaveBeenCalled();
    const input = request();
    const started = await service.start({
      ...input,
      draft: { ...input.draft, mode: 'STRESS', rampUpSeconds: 2, maxTransactions: 2 },
    });
    expect(started.ok).toBe(true);
    const run = await finished(service);
    expect(run.state).toBe('COMPLETED');
    expect(run.elapsedMs).toBeGreaterThanOrEqual(900);
  });
  it('fallo del worker cierra la fuente y persiste el error sin enviar', async () => {
    const close = vi.fn();
    const execute = vi.fn(async () => ({ ok: true as const, value: result() }));
    const service = new LoadRunService(
      runtime,
      { prepare: async () => ({ ok: true, value: { readerName: 'Synthetic', close, execute } }) },
      new FileLoadRunStore(join(directory, 'worker-error.json')),
      workerLoadScheduler(join(directory, 'missing.cjs')),
    );
    expect((await service.start(request())).ok).toBe(true);
    expect((await finished(service)).state).toBe('FAILED');
    expect(execute).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
  it('recupera un cierre inesperado como interrumpido y nunca lo reanuda', async () => {
    const { service, store, driver } = setup(async () => ({ ok: true, value: result() }));
    await store.write({
      runId: randomUUID(),
      requestId: randomUUID(),
      draft: request().draft,
      startedAt: runtime.now(),
      finishedAt: null,
      state: 'RUNNING',
      message: 'Test',
      active: 1,
      elapsedMs: 100,
      items: [],
    });
    expect(await service.current(undefined)).toMatchObject({
      ok: true,
      value: { state: 'INTERRUPTED', active: 0 },
    });
    expect(driver.prepare).not.toHaveBeenCalled();
    expect((await service.start(request())).ok).toBe(true);
    await finished(service);
  });
});
