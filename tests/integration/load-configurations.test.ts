import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { SqliteLoadConfigurations } from '../../apps/desktop/src/main/infrastructure/sqlite-load-configurations';
import { LoadConfigurationService } from '../../apps/desktop/src/main/load-configuration-service';
import { LoadConfigurationConflict } from '../../apps/desktop/src/main/load-configuration-ports';
import { stressPreset } from '../../packages/domain/src/load-configurations';
import { historyRun } from '../helpers/load-history';
import { removeTestDirectory } from '../helpers/temporary-directory';
let directory: string;
let store: SqliteLoadConfigurations;
const runtime = {
  uuid: randomUUID,
  now: () => '2026-11-03T00:00:00.000Z',
  user: 'tester',
  hostname: 'local',
  agentId: randomUUID(),
  version: 'test',
};
const preferences = {
  read: async () => ({ version: 1 as const, environment: 'QA' as const, audit: [] }),
};
const request = () => ({
  id: null,
  revision: null,
  name: 'Estrés QA',
  draft: stressPreset(historyRun().draft, 3),
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'load-configurations-'));
  store = new SqliteLoadConfigurations(join(directory, 'config.sqlite'), runtime);
});
afterEach(async () => {
  await store.close();
  await removeTestDirectory(directory, 'load-configurations-');
});

describe('biblioteca persistente de carga y estrés', () => {
  it('crea, actualiza, reabre y elimina con auditoría atómica y sin secretos', async () => {
    const first = (await store.save(request()))[0]!;
    const changed = (
      await store.save({
        id: first.id,
        revision: first.revision,
        name: 'Rampa cinco',
        draft: stressPreset(first.draft, 5),
      })
    )[0]!;
    expect(changed).toMatchObject({
      id: first.id,
      revision: 2,
      draft: { mode: 'STRESS', targetTps: 5 },
    });
    await store.close();
    expect(await store.list()).toEqual([changed]);
    expect(await store.delete({ id: changed.id, revision: changed.revision })).toEqual([]);
    const db = new DatabaseSync(join(directory, 'config.sqlite'));
    try {
      const events = db
        .prepare('SELECT action, configuration_id, actor FROM audit ORDER BY rowid')
        .all();
      expect(events.map((row) => row.action)).toEqual(['CREATED', 'UPDATED', 'DELETED']);
      expect(
        events.every((row) => row.configuration_id === first.id && row.actor === 'tester'),
      ).toBe(true);
      expect(
        db
          .prepare('PRAGMA table_info(audit)')
          .all()
          .some((row) => row.name === 'payload'),
      ).toBe(false);
    } finally {
      db.close();
    }
  });
  it('rechaza revisiones obsoletas y un intento duplicado de eliminación', async () => {
    const first = (await store.save(request()))[0]!;
    await store.save({ ...request(), id: first.id, revision: first.revision });
    await expect(
      store.save({ ...request(), id: first.id, revision: first.revision }),
    ).rejects.toBeInstanceOf(LoadConfigurationConflict);
    await expect(store.delete({ id: first.id, revision: first.revision })).rejects.toBeInstanceOf(
      LoadConfigurationConflict,
    );
    expect((await store.list())[0]?.revision).toBe(2);
    await store.delete({ id: first.id, revision: 2 });
    await expect(store.delete({ id: first.id, revision: 2 })).rejects.toBeInstanceOf(
      LoadConfigurationConflict,
    );
  });
  it('limita la biblioteca y evita guardar entradas inválidas desde el adaptador', async () => {
    for (let i = 0; i < 50; i++) await store.save(request());
    await expect(store.save(request())).rejects.toBeInstanceOf(LoadConfigurationConflict);
    await expect(store.save({ ...request(), name: 'PIN=1234' })).rejects.toThrow('CONFIG_INVALID');
    expect(await store.list()).toHaveLength(50);
  });
  it('controla ambiente, corrida activa, entradas inválidas y errores de dependencias', async () => {
    const service = new LoadConfigurationService(store, preferences, () => false);
    expect(await service.save(request())).toMatchObject({ ok: true });
    expect(await service.list({})).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await service.save({ ...request(), draft: { ...request().draft, targetTps: 6 } }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    const busy = new LoadConfigurationService(store, preferences, () => true);
    expect(await busy.save(request())).toMatchObject({ ok: false, error: { code: 'IN_USE' } });
    const preprod = new LoadConfigurationService(
      store,
      { read: async () => ({ version: 1, environment: 'PREPROD', audit: [] }) },
      () => false,
    );
    expect(await preprod.list(undefined)).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
    const failed = new LoadConfigurationService(
      store,
      {
        read: async () => {
          throw Error('private');
        },
      },
      () => false,
    );
    expect(await failed.list(undefined)).toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE' },
    });
  });
  it('maneja bloqueo SQLite y conserva un registro corrupto sin exponerlo', async () => {
    const first = (await store.save(request()))[0]!;
    const service = new LoadConfigurationService(store, preferences, () => false);
    const db = new DatabaseSync(join(directory, 'config.sqlite'));
    try {
      db.exec('BEGIN EXCLUSIVE');
      expect(await service.list(undefined)).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
      db.exec('ROLLBACK');
      expect(await service.list(undefined)).toMatchObject({ ok: true });
      db.prepare('UPDATE configurations SET payload = ? WHERE id = ?').run(
        'private-corrupt',
        first.id,
      );
      const result = await service.list(undefined);
      expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
      expect(JSON.stringify(result)).not.toContain('private-corrupt');
      expect(db.prepare('SELECT payload FROM configurations').get()?.payload).toBe(
        'private-corrupt',
      );
    } finally {
      db.close();
    }
  });
  it('conserva una base corrupta y no la sustituye al fallar', async () => {
    const file = join(directory, 'config.sqlite');
    await writeFile(file, 'corrupt-file');
    await expect(store.list()).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe('corrupt-file');
  });
});
