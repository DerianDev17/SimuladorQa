import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import { RedisReadCache } from '../../apps/desktop/src/main/infrastructure/redis-read-cache';
import type { Preferences } from '../../apps/desktop/src/main/ports';
import type { CatalogCommand, CatalogContext } from '../../packages/shared/src/catalog-worker';
import type { MediatorLiveRequest } from '../../packages/domain/src/mediator-live';
import { MemoryRedisConnection } from '../helpers/redis-cache';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('consultas de presentación con Redis y catálogo SQLite', () => {
  let directory: string;
  let sqlite: SqliteCatalog;
  let cache: RedisReadCache;
  let redis: MemoryRedisConnection;
  let application: DesktopApplication;
  let preferences: Preferences;
  let now: number;
  const execute =
    vi.fn<
      (
        command: CatalogCommand,
        context: CatalogContext,
      ) => Promise<ReturnType<SqliteCatalog['execute']>>
    >();
  const live = vi.fn(async () => ({
    ok: true as const,
    value: { rows: [], hasMore: false },
  }));
  const query: MediatorLiveRequest = {
    mode: 'live',
    environment: 'QA',
    entityId: 205,
    channelId: 1,
    limit: 50,
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-read-cache-'));
    sqlite = new SqliteCatalog(join(directory, 'catalog.sqlite'));
    now = Date.parse('2026-11-12T12:00:00.000Z');
    preferences = { version: 1, environment: 'QA', audit: [] };
    redis = new MemoryRedisConnection();
    cache = new RedisReadCache(
      6379,
      () => now,
      () => redis,
    );
    execute
      .mockReset()
      .mockImplementation(async (command, context) => sqlite.execute(command, context));
    live.mockClear();
    const args: ConstructorParameters<typeof DesktopApplication> = [
      {
        read: async () => preferences,
        write: async (next) => {
          preferences = next;
        },
      },
      {
        agentId: randomUUID(),
        hostname: 'synthetic',
        user: 'synthetic',
        version: 'test',
        uuid: randomUUID,
        now: () => new Date(now).toISOString(),
      },
      { execute, close: async () => {} },
    ];
    args[6] = {
      live,
      search: async () => ({
        ok: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'not used' },
      }),
    };
    args[16] = cache;
    application = new DesktopApplication(...args);
  });
  afterEach(async () => {
    cache.close();
    sqlite.close();
    await removeTestDirectory(directory, 'coonecta-read-cache-');
  });

  it('cachea la presentación; las consultas internas siguen leyendo SQLite', async () => {
    await application.getCatalog({ environment: 'QA' });
    await application.getCatalog({ environment: 'QA' });
    expect(execute).toHaveBeenCalledTimes(1);
    await application.catalog('list', { environment: 'QA' });
    await application.catalog('list', { environment: 'QA' });
    expect(execute).toHaveBeenCalledTimes(3);
    now += 30_000;
    await application.getCatalog({ environment: 'QA' });
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('guardar y eliminar invalidan el catálogo cacheado', async () => {
    await application.getCatalog({ environment: 'QA' });
    const saved = await application.catalog('saveEntity', {
      environment: 'QA',
      id: null,
      revision: null,
      values: { code: '205', name: 'Synthetic entity', networkType: 'COONECTA', active: true },
    });
    if (!saved.ok) throw Error(saved.error.code);
    const entity = saved.value.entities[0]!;
    expect(await application.getCatalog({ environment: 'QA' })).toEqual(saved);
    expect(execute).toHaveBeenCalledTimes(3);
    const removed = await application.catalog('deleteEntity', {
      environment: 'QA',
      id: entity.id,
      revision: entity.revision,
    });
    expect(await application.getCatalog({ environment: 'QA' })).toEqual(removed);
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('valida entradas y ambiente antes de usar una entrada cacheada', async () => {
    await application.getCatalog({ environment: 'QA' });
    const gets = redis.get.mock.calls.length;
    for (const payload of [null, { environment: 'PROD' }, { environment: 'QA', extra: true }])
      expect(await application.getCatalog(payload)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    preferences.environment = 'PREPROD';
    expect(await application.getCatalog({ environment: 'QA' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(redis.get).toHaveBeenCalledTimes(gets);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('el feed conserva la fecha original, separa filtros y caduca en dos segundos', async () => {
    const first = await application.getMediatorLive(query);
    now += 1000;
    expect(await application.getMediatorLive(query)).toEqual(first);
    expect(live).toHaveBeenCalledTimes(1);
    await application.getMediatorLive({ ...query, limit: 10 });
    expect(live).toHaveBeenCalledTimes(2);
    now += 1000;
    const fresh = await application.getMediatorLive(query);
    expect(fresh).not.toEqual(first);
    expect(live).toHaveBeenCalledTimes(3);
    expect(await application.getMediatorLive({ ...query, limit: 51 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    preferences.environment = 'PREPROD';
    expect(await application.getMediatorLive(query)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
  });

  it('al cambiar ambiente invalida ambas consultas', async () => {
    await application.getCatalog({ environment: 'QA' });
    await application.getMediatorLive(query);
    await application.setEnvironment({ environment: 'PREPROD' });
    await application.setEnvironment({ environment: 'QA' });
    await application.getCatalog({ environment: 'QA' });
    await application.getMediatorLive(query);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(live).toHaveBeenCalledTimes(2);
  });

  it('Redis caído no impide consultar ni guardar datos', async () => {
    redis.connect.mockRejectedValue(Error('unavailable'));
    expect(await application.getCatalog({ environment: 'QA' })).toMatchObject({ ok: true });
    expect(await application.getMediatorLive(query)).toMatchObject({ ok: true });
    expect(
      await application.catalog('saveEntity', {
        environment: 'QA',
        id: null,
        revision: null,
        values: { code: '205', name: 'Synthetic entity', networkType: 'COONECTA', active: true },
      }),
    ).toMatchObject({ ok: true });
    const result = await application.getCatalog({ environment: 'QA' });
    expect(result.ok && result.value.entities.length).toBe(1);
    expect(redis.connect).toHaveBeenCalledTimes(1);
  });
});
