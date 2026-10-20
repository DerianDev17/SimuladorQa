import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { LoadRunService } from '../../apps/desktop/src/main/load-run-service';
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
function setup(execute: (signal: AbortSignal, runId: string) => Promise<Result<BalanceExecution>>) {
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
    ),
    store,
    close,
    driver,
  };
}
describe('worker de carga con persistencia real', () => {
  it('respeta el ritmo sin solapamiento, termina por cantidad y recupera la corrida sin secretos', async () => {
    const starts: number[] = [];
    const ends: number[] = [];
    let inFlight = 0;
    const { service, store, close } = setup(async (_signal, runId) => {
      starts.push(performance.now());
      inFlight++;
      expect(inFlight).toBe(1);
      await new Promise((done) => setTimeout(done, 40));
      inFlight--;
      ends.push(performance.now());
      return { ok: true, value: { ...result(), runId } };
    });
    const input = request();
    expect((await service.start(input)).ok).toBe(true);
    const run = await finished(service);
    expect(run.state).toBe('COMPLETED');
    expect(run.items).toHaveLength(3);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]! - ends[i - 1]!).toBeGreaterThanOrEqual(190);
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
  it('el límite de duración cancela una dependencia que espera y limpia la sesión', async () => {
    const { service, close } = setup(
      (signal) =>
        new Promise((done) =>
          signal.addEventListener(
            'abort',
            () => done({ ok: false, error: { code: 'TIMEOUT', message: 'Tiempo agotado.' } }),
            { once: true },
          ),
        ),
    );
    const input = request();
    input.draft.durationSeconds = 1;
    await service.start(input);
    const run = await finished(service);
    expect(run.state).toBe('COMPLETED');
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
