import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient } from '@redis/client';
import type { Result } from '../../../../../packages/shared/src/contracts';
import type { ReadCachePort } from '../read-cache-port';

export interface RedisCacheConnection {
  readonly isOpen: boolean;
  readonly isReady: boolean;
  connect(): Promise<unknown>;
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options: { expiration: { type: 'PX'; value: number } },
  ): Promise<unknown>;
  destroy(): void;
  on(event: 'error', listener: () => void): unknown;
}

export function redisCachePort(
  environment: Record<string, string | undefined>,
): number | undefined {
  if (environment.SIMULATOR_REDIS_CACHE === 'off') return undefined;
  const text = environment.SIMULATOR_REDIS_PORT ?? '6379';
  if (!/^\d{1,5}$/.test(text)) return undefined;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : undefined;
}

const deadlineMs = 150;
const retryDelayMs = 30_000;
const maxEntryBytes = 1_048_576;

export class RedisReadCache implements ReadCachePort {
  private readonly namespace = `simqa:reads:v1:${randomUUID()}`;
  private readonly secret = randomBytes(32);
  private generation = 0;
  private closed = false;
  private unavailableUntil = 0;
  private connection: RedisCacheConnection | undefined;
  private connecting: Promise<void> | undefined;
  private readonly pending = new Map<string, Promise<Result<unknown>>>();

  constructor(
    port: number,
    private readonly now: () => number = Date.now,
    private readonly createConnection: () => RedisCacheConnection = () =>
      createClient({
        socket: { host: '127.0.0.1', port, connectTimeout: deadlineMs, reconnectStrategy: false },
        disableOfflineQueue: true,
        commandsQueueMaxLength: 32,
        commandOptions: { timeout: deadlineMs },
        disableClientInfo: true,
      }),
  ) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('INVALID_CACHE_PORT');
  }

  invalidate(): void {
    this.generation++;
    this.pending.clear();
  }

  close(): void {
    this.closed = true;
    this.invalidate();
    this.disconnect();
    this.secret.fill(0);
  }

  private disconnect(): void {
    const connection = this.connection;
    this.connection = undefined;
    this.connecting = undefined;
    if (connection?.isOpen) connection.destroy();
  }

  private async command<T>(
    operation: (connection: RedisCacheConnection) => Promise<T>,
  ): Promise<T | undefined> {
    if (this.closed || this.now() < this.unavailableUntil) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          if (!this.connection) {
            const connection = this.createConnection();
            // Never log Redis errors: neither endpoints nor cache contents are diagnostics.
            connection.on('error', () => {});
            this.connection = connection;
          }
          const connection = this.connection;
          if (!connection.isReady) {
            this.connecting ??= connection.connect().then(() => {});
            await this.connecting;
            if (this.closed || connection !== this.connection) return undefined;
          }
          return operation(connection);
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error('CACHE_TIMEOUT')), deadlineMs);
        }),
      ]);
    } catch {
      this.unavailableUntil = this.now() + retryDelayMs;
      this.disconnect();
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }

  private signature(key: string, payload: string): Buffer {
    return createHmac('sha256', this.secret).update(key).update('\n').update(payload).digest();
  }

  private decode<T>(key: string, entry: string): Result<T> | undefined {
    if (Buffer.byteLength(entry) > maxEntryBytes) return undefined;
    try {
      const envelope: unknown = JSON.parse(entry);
      if (!envelope || typeof envelope !== 'object') return undefined;
      const { payload, signature } = envelope as Record<string, unknown>;
      if (
        typeof payload !== 'string' ||
        typeof signature !== 'string' ||
        !/^[a-f0-9]{64}$/.test(signature)
      )
        return undefined;
      if (!timingSafeEqual(this.signature(key, payload), Buffer.from(signature, 'hex')))
        return undefined;
      // Only this process can issue signed entries; cache data cannot inject an
      // arbitrary DTO, extend its expiry or move it to a different query key.
      const decoded = JSON.parse(payload) as { expiresAt: number; result: Result<T> };
      return Number.isFinite(decoded.expiresAt) &&
        decoded.expiresAt > this.now() &&
        decoded.result?.ok
        ? decoded.result
        : undefined;
    } catch {
      return undefined;
    }
  }

  read<T>(key: string, ttlMs: number, load: () => Promise<Result<T>>): Promise<Result<T>> {
    if (
      this.closed ||
      !/^(catalog:QA|mediator:QA:205:1:([1-9]|[1-4]\d|50))$/.test(key) ||
      !Number.isInteger(ttlMs) ||
      ttlMs < 1 ||
      ttlMs > 30_000
    )
      return load();
    const generation = this.generation;
    const cacheKey = `${this.namespace}:${generation}:${key}`;
    const existing = this.pending.get(cacheKey);
    if (existing) return existing as Promise<Result<T>>;
    const pending = this.readThrough(cacheKey, generation, ttlMs, load).finally(() => {
      if (this.pending.get(cacheKey) === pending) this.pending.delete(cacheKey);
    });
    this.pending.set(cacheKey, pending);
    return pending;
  }

  private async readThrough<T>(
    key: string,
    generation: number,
    ttlMs: number,
    load: () => Promise<Result<T>>,
  ): Promise<Result<T>> {
    const cached = await this.command((connection) => connection.get(key));
    const hit = cached ? this.decode<T>(key, cached) : undefined;
    if (hit && generation === this.generation && !this.closed) return hit;
    const result = await load();
    if (
      !result.ok ||
      generation !== this.generation ||
      this.closed ||
      this.now() < this.unavailableUntil
    )
      return result;
    try {
      const payload = JSON.stringify({ expiresAt: this.now() + ttlMs, result });
      const entry = JSON.stringify({
        payload,
        signature: this.signature(key, payload).toString('hex'),
      });
      if (Buffer.byteLength(entry) <= maxEntryBytes)
        await this.command((connection) =>
          connection.set(key, entry, { expiration: { type: 'PX', value: ttlMs } }),
        );
    } catch {
      // Serialization/cache failure must not turn a successful source read into an error.
    }
    return result;
  }
}
