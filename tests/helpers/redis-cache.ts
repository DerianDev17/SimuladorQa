import { vi } from 'vitest';
import type { RedisCacheConnection } from '../../apps/desktop/src/main/infrastructure/redis-read-cache';

export class MemoryRedisConnection implements RedisCacheConnection {
  isOpen = false;
  isReady = false;
  readonly values = new Map<string, string>();
  connect = vi.fn(async () => {
    this.isOpen = true;
    this.isReady = true;
  });
  get = vi.fn(async (key: string) => this.values.get(key) ?? null);
  set = vi.fn<RedisCacheConnection['set']>(async (key, value) => {
    this.values.set(key, value);
  });
  destroy = vi.fn(() => {
    this.isOpen = false;
    this.isReady = false;
  });
  on = vi.fn();
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
