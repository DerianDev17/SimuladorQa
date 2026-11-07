import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkerLoadRunStore } from '../../apps/desktop/src/main/infrastructure/worker-load-run-store';
import { historyRun } from '../helpers/load-history';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('persistencia de carga fuera de Main', () => {
  let directory: string;
  let script: string;
  const stores: WorkerLoadRunStore[] = [];
  function create(name: string, entry = script, timeout = 10000) {
    const store = new WorkerLoadRunStore(
      entry,
      join(directory, name + '.sqlite'),
      join(directory, name + '.json'),
      timeout,
    );
    stores.push(store);
    return store;
  }
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'load-store-worker-'));
    script = join(directory, 'worker.cjs');
    await build({
      entryPoints: [resolve('apps/desktop/src/main/infrastructure/load-store-worker.ts')],
      outfile: script,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
    });
  });
  afterAll(async () => {
    await Promise.allSettled(stores.map((store) => store.close()));
    await removeTestDirectory(directory, 'load-store-worker-');
  });

  it('copia escrituras encoladas, conserva orden, pagina y drena antes del cierre', async () => {
    const store = create('ordered');
    const runs = Array.from({ length: 23 }, () => historyRun());
    const original = structuredClone(runs[0]!);
    const writing = runs.map((run) => store.write(run));
    runs[0]!.message = 'Cambio posterior';
    await Promise.all(writing);
    expect(await store.get(original.runId)).toEqual(original);
    const page = await store.list({});
    expect(page.entries).toHaveLength(20);
    expect((await store.list({ before: page.next! })).entries).toHaveLength(3);
    expect(await store.hasRequest(original.requestId)).toBe(true);
    const last = historyRun();
    const lastWrite = store.write(last);
    const closing = store.close();
    await expect(store.read()).rejects.toThrow('LOAD_STORE_CLOSED');
    await lastWrite;
    await closing;
    expect(await create('ordered').read()).toEqual(last);
  });

  it('valida entradas, mantiene idempotencia y no expone errores privados', async () => {
    const store = create('validation');
    await expect(store.list({ atmId: '../private' })).rejects.toThrow('LOAD_HISTORY_INVALID');
    await expect(store.get('invalid')).rejects.toThrow('LOAD_RUN_INVALID');
    const run = historyRun();
    await store.write(run);
    await expect(store.write({ ...historyRun(), requestId: run.requestId })).rejects.toThrow(
      'LOAD_RUN_DUPLICATE_REQUEST',
    );
    expect(await store.read()).toEqual(run);
    const missing = create('missing', join(directory, 'private-secret.cjs'));
    await expect(missing.read()).rejects.toThrow(/^LOAD_STORE_UNAVAILABLE$/);
  });

  it('un bloqueo SQLite no detiene el event loop y permite recuperar la lectura', async () => {
    const store = create('locked');
    await store.write(historyRun());
    const external = new DatabaseSync(join(directory, 'locked.sqlite'));
    try {
      external.exec('BEGIN EXCLUSIVE');
      let settled = false;
      const query = store.list({}).finally(() => {
        settled = true;
      });
      const rejected = expect(query).rejects.toThrow('LOAD_STORE_UNAVAILABLE');
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 50));
      expect(settled).toBe(false);
      await rejected;
      external.exec('ROLLBACK');
      expect((await store.list({})).entries).toHaveLength(1);
    } finally {
      external.close();
    }
  });

  it('timeout rechaza pendientes sin reiniciar ni reenviar una escritura incierta', async () => {
    const hung = join(directory, 'hung.cjs');
    await writeFile(hung, "require('node:worker_threads').parentPort.on('message', () => {});");
    const store = create('timeout', hung, 100);
    await expect(store.write(historyRun())).rejects.toThrow('LOAD_STORE_TIMEOUT');
    await expect(store.read()).rejects.toThrow('LOAD_STORE_TIMEOUT');
    await store.close();
  });
});
