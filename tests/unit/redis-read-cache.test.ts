import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RedisReadCache,
  redisCachePort,
} from '../../apps/desktop/src/main/infrastructure/redis-read-cache';
import { MemoryRedisConnection, deferred } from '../helpers/redis-cache';
import type { Result } from '../../packages/shared/src/contracts';

afterEach(() => vi.useRealTimers());
const success = () => ({ ok: true as const, value: { name: 'Synthetic catalog' } });

describe('caché Redis opcional', () => {
  it('valida configuración local y permite desactivarla', () => {
    expect(redisCachePort({})).toBe(6379);
    expect(redisCachePort({ SIMULATOR_REDIS_PORT: '6380' })).toBe(6380);
    expect(redisCachePort({ SIMULATOR_REDIS_CACHE: 'off' })).toBeUndefined();
    for (const value of ['0', '-1', '65536', '6379x', '1.5', '', 'redis://remote'])
      expect(redisCachePort({ SIMULATOR_REDIS_PORT: value })).toBeUndefined();
    expect(() => new RedisReadCache(0)).toThrow('INVALID_CACHE_PORT');
  });

  it('reutiliza resultados, escribe TTL y relee al caducar', async () => {
    let now = 0;
    const redis = new MemoryRedisConnection();
    const cache = new RedisReadCache(
      6379,
      () => now,
      () => redis,
    );
    const source = vi.fn(async () => success());
    expect(await cache.read('catalog:QA', 30_000, source)).toEqual(success());
    const hit = await cache.read('catalog:QA', 30_000, source);
    expect(hit).toEqual(success());
    expect(source).toHaveBeenCalledTimes(1);
    expect(redis.set.mock.calls[0]?.[2]).toEqual({ expiration: { type: 'PX', value: 30_000 } });
    if (hit.ok) hit.value.name = 'changed by consumer';
    expect(await cache.read('catalog:QA', 30_000, source)).toEqual(success());
    now = 30_000;
    await cache.read('catalog:QA', 30_000, source);
    expect(source).toHaveBeenCalledTimes(2);
    cache.close();
    expect(redis.destroy).toHaveBeenCalledTimes(1);
  });

  it('agrupa misses simultáneos y aísla sesiones y filtros', async () => {
    const redis = new MemoryRedisConnection();
    const cache = new RedisReadCache(6379, Date.now, () => redis);
    const pending = deferred<Result<{ name: string }>>();
    const source = vi.fn(() => pending.promise);
    const first = cache.read('catalog:QA', 30_000, source);
    expect(cache.read('catalog:QA', 30_000, source)).toBe(first);
    pending.resolve(success());
    await first;
    expect(source).toHaveBeenCalledTimes(1);
    await cache.read('mediator:QA:205:1:10', 2_000, source);
    await cache.read('mediator:QA:205:1:50', 2_000, source);
    const another = new RedisReadCache(6379, Date.now, () => redis);
    await another.read('catalog:QA', 30_000, source);
    expect(source).toHaveBeenCalledTimes(4);
    expect(redis.values.size).toBe(4);
    cache.close();
    another.close();
  });

  it('rechaza entradas corruptas, alteradas, demasiado grandes o movidas entre claves', async () => {
    const redis = new MemoryRedisConnection();
    const cache = new RedisReadCache(6379, Date.now, () => redis);
    const source = vi.fn(async () => success());
    await cache.read('catalog:QA', 30_000, source);
    const key = [...redis.values.keys()][0]!;
    const original = redis.values.get(key)!;
    for (const corrupt of [
      '{',
      'null',
      original.replace('Synthetic', 'Injected'),
      'x'.repeat(1_048_577),
    ]) {
      redis.values.set(key, corrupt);
      expect(await cache.read('catalog:QA', 30_000, source)).toEqual(success());
    }
    await cache.read('mediator:QA:205:1:50', 2_000, source);
    const otherKey = [...redis.values.keys()].find((item) => item !== key)!;
    redis.values.set(otherKey, original);
    await cache.read('mediator:QA:205:1:50', 2_000, source);
    expect(source).toHaveBeenCalledTimes(7);
    cache.close();
  });

  it('solo permite las consultas públicas previstas y plazos acotados', async () => {
    const factory = vi.fn(() => new MemoryRedisConnection());
    const cache = new RedisReadCache(6379, Date.now, factory);
    const source = vi.fn(async () => success());
    for (const key of [
      'catalog:PROD',
      'sessionMessages:QA',
      'catalog:PREPROD',
      'mediator:QA:205:1:51',
    ])
      await cache.read(key, 1000, source);
    for (const ttl of [0, -1, 30_001, NaN, 1.5]) await cache.read('catalog:QA', ttl, source);
    expect(factory).not.toHaveBeenCalled();
    expect(source).toHaveBeenCalledTimes(9);
    cache.close();
  });

  it('no guarda errores del origen y permite recuperarse de rechazos', async () => {
    const redis = new MemoryRedisConnection();
    const cache = new RedisReadCache(6379, Date.now, () => redis);
    const error = {
      ok: false as const,
      error: { code: 'STORAGE_UNAVAILABLE' as const, message: 'No disponible' },
    };
    expect(await cache.read('catalog:QA', 1000, async () => error)).toEqual(error);
    await expect(
      cache.read('catalog:QA', 1000, async () => {
        throw Error('source failed');
      }),
    ).rejects.toThrow('source failed');
    expect(redis.set).not.toHaveBeenCalled();
    expect(await cache.read('catalog:QA', 1000, async () => success())).toEqual(success());
    cache.close();
  });

  it('ante error Redis usa el origen, evita reconexiones repetidas y se recupera', async () => {
    let now = 0;
    const redis = new MemoryRedisConnection();
    redis.get.mockRejectedValueOnce(Error('private-detail'));
    const factory = vi.fn(() => redis);
    const cache = new RedisReadCache(6379, () => now, factory);
    const source = vi.fn(async () => success());
    for (let index = 0; index < 3; index++)
      expect(await cache.read('catalog:QA', 1000, source)).toEqual(success());
    expect(factory).toHaveBeenCalledTimes(1);
    expect(redis.destroy).toHaveBeenCalledTimes(1);
    now = 30_000;
    await cache.read('catalog:QA', 1000, source);
    await cache.read('catalog:QA', 1000, source);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(source).toHaveBeenCalledTimes(4);
    cache.close();
  });

  it.each(['connect', 'get', 'set'] as const)(
    'limita una dependencia bloqueada en %s',
    async (method) => {
      vi.useFakeTimers();
      const redis = new MemoryRedisConnection();
      const blocked = deferred<never>();
      redis[method].mockImplementation(() => blocked.promise);
      const cache = new RedisReadCache(6379, Date.now, () => redis);
      const result = cache.read('catalog:QA', 1000, async () => success());
      await vi.advanceTimersByTimeAsync(151);
      expect(await result).toEqual(success());
      expect(vi.getTimerCount()).toBe(0);
      cache.close();
    },
  );

  it('invalidar durante una lectura no repuebla la generación nueva con datos antiguos', async () => {
    const redis = new MemoryRedisConnection();
    const cache = new RedisReadCache(6379, Date.now, () => redis);
    const pending = deferred<Result<string>>();
    const started = deferred<void>();
    const first = cache.read('catalog:QA', 1000, () => {
      started.resolve();
      return pending.promise;
    });
    await started.promise;
    cache.invalidate();
    const source = vi.fn(async () => ({ ok: true as const, value: 'new' }));
    await cache.read('catalog:QA', 1000, source);
    pending.resolve({ ok: true, value: 'old' });
    await first;
    expect(await cache.read('catalog:QA', 1000, source)).toEqual({ ok: true, value: 'new' });
    expect(source).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(1);
    cache.close();
  });

  it('cerrar durante una lectura impide escrituras y conexiones posteriores', async () => {
    const redis = new MemoryRedisConnection();
    const cache = new RedisReadCache(6379, Date.now, () => redis);
    const pending = deferred<Result<string>>();
    const started = deferred<void>();
    const first = cache.read('catalog:QA', 1000, () => {
      started.resolve();
      return pending.promise;
    });
    await started.promise;
    cache.close();
    pending.resolve({ ok: true, value: 'old' });
    await first;
    await cache.read('catalog:QA', 1000, async () => success());
    expect(redis.set).not.toHaveBeenCalled();
    expect(redis.connect).toHaveBeenCalledTimes(1);
  });
});
