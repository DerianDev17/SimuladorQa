import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RedisReadCache } from '../../apps/desktop/src/main/infrastructure/redis-read-cache';

// A deliberately small RESP fixture, never a production Redis implementation.
function command(buffer: Buffer): { args: string[]; length: number } | undefined {
  const firstLine = buffer.indexOf('\r\n');
  if (firstLine === -1) return undefined;
  if (buffer[0] !== 42) throw Error('Expected RESP array');
  const count = Number(buffer.subarray(1, firstLine).toString());
  let offset = firstLine + 2;
  const args: string[] = [];
  for (let index = 0; index < count; index++) {
    const end = buffer.indexOf('\r\n', offset);
    if (end === -1) return undefined;
    if (buffer[offset] !== 36) throw Error('Expected RESP bulk string');
    const size = Number(buffer.subarray(offset + 1, end).toString());
    if (buffer.length < end + 2 + size + 2) return undefined;
    args.push(buffer.subarray(end + 2, end + 2 + size).toString());
    offset = end + 2 + size + 2;
  }
  return { args, length: offset };
}

async function redisFixture(silent = false) {
  const values = new Map<string, { value: string; expiresAt: number }>();
  const requests: string[][] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      if (silent) return;
      buffer = Buffer.concat([buffer, chunk]);
      let current;
      while ((current = command(buffer))) {
        buffer = buffer.subarray(current.length);
        const [name, key, value, expiry, ttl] = current.args;
        requests.push(current.args);
        if (name === 'HELLO') socket.write('%0\r\n');
        else if (name === 'CLIENT') socket.write('+OK\r\n');
        else if (name === 'SET' && key && value && expiry === 'PX' && ttl) {
          values.set(key, { value, expiresAt: Date.now() + Number(ttl) });
          socket.write('+OK\r\n');
        } else if (name === 'GET' && key) {
          const entry = values.get(key);
          if (!entry || entry.expiresAt <= Date.now()) socket.write('$-1\r\n');
          else {
            const response = Buffer.from(
              `$${Buffer.byteLength(entry.value)}\r\n${entry.value}\r\n`,
            );
            // The actual client must tolerate fragmented replies.
            socket.write(response.subarray(0, 5));
            socket.write(response.subarray(5));
          }
        } else socket.write('-ERR Unsupported fixture command\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('NO_PORT');
  return {
    port: address.port,
    values,
    requests,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('cliente Redis oficial contra TCP local', () => {
  const cleanup: (() => Promise<void> | void)[] = [];
  afterEach(async () => {
    for (const close of cleanup.reverse()) await close();
    cleanup.length = 0;
  });

  it('envía GET/SET PX, comparte misses, recupera hits e invalida sin FLUSHDB', async () => {
    const server = await redisFixture();
    cleanup.push(() => server.close());
    const cache = new RedisReadCache(server.port);
    cleanup.push(() => cache.close());
    const source = vi.fn(async () => ({
      ok: true as const,
      value: { entities: ['Entidad sintética'] },
    }));
    const values = await Promise.all([
      cache.read('catalog:QA', 30_000, source),
      cache.read('catalog:QA', 30_000, source),
    ]);
    expect(values[0]).toEqual(values[1]);
    expect(source).toHaveBeenCalledTimes(1);
    expect(server.values.size).toBe(1);
    await cache.read('catalog:QA', 30_000, source);
    expect(source).toHaveBeenCalledTimes(1);
    cache.invalidate();
    await cache.read('catalog:QA', 30_000, source);
    expect(source).toHaveBeenCalledTimes(2);
    expect(server.requests.filter((args) => args[0] === 'SET')).toHaveLength(2);
    expect(
      server.requests.every((args) => ['HELLO', 'CLIENT', 'GET', 'SET'].includes(args[0]!)),
    ).toBe(true);
  });

  it('una conexión aceptada que no responde tiene plazo y no acumula reintentos', async () => {
    const server = await redisFixture(true);
    cleanup.push(() => server.close());
    const cache = new RedisReadCache(server.port);
    cleanup.push(() => cache.close());
    const source = vi.fn(async () => ({ ok: true as const, value: 'source' }));
    const start = performance.now();
    expect(await cache.read('catalog:QA', 30_000, source)).toEqual({ ok: true, value: 'source' });
    expect(performance.now() - start).toBeLessThan(2000);
    await cache.read('catalog:QA', 30_000, source);
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('un puerto sin servicio no impide leer de la fuente', async () => {
    const server = await redisFixture();
    const port = server.port;
    await server.close();
    const cache = new RedisReadCache(port);
    cleanup.push(() => cache.close());
    expect(
      await cache.read('catalog:QA', 30_000, async () => ({ ok: true, value: 'source' })),
    ).toEqual({ ok: true, value: 'source' });
  });
});
