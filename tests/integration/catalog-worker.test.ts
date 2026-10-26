import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { mkdtemp, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkerCatalogStore } from '../../apps/desktop/src/main/infrastructure/worker-catalog-store';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('adaptador Worker con procesos reales', () => {
  let directory: string;
  let script: string;
  const stores: WorkerCatalogStore[] = [];
  const context = {
    user: 'test-user',
    machine: 'test-machine',
    timestamp: '2026-10-06T12:00:00.000Z',
  };
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-worker-'));
    script = join(directory, 'catalog-worker.cjs');
    await build({
      entryPoints: [resolve('apps/desktop/src/main/infrastructure/catalog-worker.ts')],
      outfile: script,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      target: 'node22',
    });
  });
  afterAll(async () => {
    await Promise.all(stores.map((store) => store.close()));
    await removeTestDirectory(directory, 'coonecta-worker-');
  });

  it('ejecuta y persiste desde un worker, y libera la base al cerrar', async () => {
    const file = join(directory, 'worker.sqlite');
    const store = new WorkerCatalogStore(script, file);
    stores.push(store);
    expect(
      await store.execute(
        {
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: null,
            revision: null,
            values: { code: 'TEST', name: 'Worker Entity', networkType: 'COONECTA', active: true },
          },
        },
        context,
      ),
    ).toMatchObject({ ok: true });
    await store.close();
    expect(await store.execute({ kind: 'list', environment: 'QA' }, context)).toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    const restarted = new WorkerCatalogStore(script, file);
    stores.push(restarted);
    expect(await restarted.execute({ kind: 'list', environment: 'QA' }, context)).toMatchObject({
      ok: true,
      value: { entities: [{ name: 'Worker Entity' }] },
    });
  });
  it('resuelve errores de arranque sin filtrar la ruta o el error técnico', async () => {
    const store = new WorkerCatalogStore(
      join(directory, 'private-secret.cjs'),
      join(directory, 'missing.sqlite'),
    );
    stores.push(store);
    const result = await store.execute({ kind: 'list', environment: 'QA' }, context);
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
  });
  it('termina una dependencia que no responde y recupera el servicio al corregirla', async () => {
    const hung = join(directory, 'hung-worker.cjs');
    await writeFile(
      hung,
      "const {parentPort}=require('node:worker_threads'); parentPort.on('message',()=>{});",
    );
    const store = new WorkerCatalogStore(hung, join(directory, 'recovered.sqlite'));
    stores.push(store);
    expect(await store.execute({ kind: 'list', environment: 'QA' }, context)).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    await copyFile(script, hung);
    expect(await store.execute({ kind: 'list', environment: 'QA' }, context)).toMatchObject({
      ok: true,
      value: { entities: [] },
    });
  });
});
