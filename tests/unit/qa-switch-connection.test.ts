import { Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QaSwitchConnection } from '../../apps/desktop/src/main/adapters/qa-switch-connection';
import type { SwitchConnectionPort } from '../../apps/desktop/src/main/switch-connection-port';

const request = {
  environment: 'QA' as const,
  endpoint: { host: '127.0.0.1', port: 16100 },
  connectDeadlineMs: 500,
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('estado de conexión QA', () => {
  function observing() {
    const sockets: Socket[] = [];
    const factory = vi.fn(() => {
      const socket = new Socket();
      vi.spyOn(socket, 'connect').mockImplementation(() => socket);
      sockets.push(socket);
      return socket;
    });
    const connection = new QaSwitchConnection(factory);
    connection.connect(request);
    sockets[0]!.emit('connect');
    return { connection, factory, sockets };
  }
  it.each([false, true])(
    'serializa sockets del mismo run y restaura solo al cerrar todos; desconexión=%s',
    async (disconnect) => {
      const { connection, factory } = observing();
      const load = { runId: randomUUID(), concurrency: 2 };
      const releases: (() => void)[] = [];
      const exchange = () => new Promise<void>((resolve) => releases.push(resolve));
      const first = connection.withTransaction(request.endpoint, exchange, load);
      const second = connection.withTransaction(request.endpoint, exchange, load);
      await vi.waitFor(() => expect(releases).toHaveLength(1));
      await expect(connection.withTransaction(request.endpoint, exchange, load)).rejects.toThrow(
        'QA_CONNECTION_BUSY',
      );
      await expect(
        connection.withTransaction(request.endpoint, exchange, { ...load, runId: randomUUID() }),
      ).rejects.toThrow('QA_CONNECTION_BUSY');
      await expect(
        connection.withTransaction({ ...request.endpoint, port: 16101 }, exchange, load),
      ).rejects.toThrow('QA_CONNECTION_BUSY');
      await expect(connection.withTransaction(request.endpoint, exchange)).rejects.toThrow(
        'QA_CONNECTION_BUSY',
      );
      if (disconnect) connection.disconnect('USER_DISCONNECTED');
      releases[0]!();
      await first;
      await vi.waitFor(() => expect(releases).toHaveLength(2));
      expect(factory).toHaveBeenCalledOnce();
      expect(() => connection.connect(request)).toThrow('QA_CONNECTION_BUSY');
      releases[1]!();
      await second;
      expect(factory).toHaveBeenCalledTimes(disconnect ? 1 : 2);
      connection.disconnect('APP_CLOSED');
    },
  );
  it.each(['CANCEL', 'EXPIRED'] as const)(
    'retira espera por %s sin adelantar el siguiente socket',
    async (reason) => {
      const connection = new QaSwitchConnection();
      const load = { runId: randomUUID(), concurrency: 3 };
      let release!: () => void;
      const first = connection.withTransaction(
        request.endpoint,
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
        load,
      );
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      const abort = new AbortController();
      const exchange = vi.fn(async () => 'unexpected');
      const second = connection.withTransaction(request.endpoint, exchange, load, {
        signal: abort.signal,
        ...(reason === 'EXPIRED' ? { load: { deadline: performance.now() + 30 } } : {}),
      });
      const rejection = expect(second).rejects.toThrow(
        reason === 'CANCEL' ? 'QA_CONNECTION_CANCELLED' : 'QA_CONNECTION_EXPIRED',
      );
      if (reason === 'CANCEL') abort.abort();
      await rejection;
      const thirdExchange = vi.fn(async () => 'third');
      const third = connection.withTransaction(request.endpoint, thirdExchange, load);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(exchange).not.toHaveBeenCalled();
      expect(thirdExchange).not.toHaveBeenCalled();
      release();
      await first;
      expect(await third).toBe('third');
    },
  );
  it.each(['ABORTED', 'EXPIRED'] as const)(
    'no abre transporte para una solicitud ya %s',
    async (reason) => {
      const connection = new QaSwitchConnection();
      const abort = new AbortController();
      if (reason === 'ABORTED') abort.abort();
      const exchange = vi.fn(async () => undefined);
      await expect(
        connection.withTransaction(
          request.endpoint,
          exchange,
          { runId: randomUUID(), concurrency: 1 },
          {
            signal: abort.signal,
            load: {
              deadline: reason === 'EXPIRED' ? performance.now() - 1 : performance.now() + 1000,
            },
          },
        ),
      ).rejects.toThrow(reason === 'ABORTED' ? 'QA_CONNECTION_CANCELLED' : 'QA_CONNECTION_EXPIRED');
      expect(exchange).not.toHaveBeenCalled();
      expect(await connection.withTransaction(request.endpoint, async () => 'released')).toBe(
        'released',
      );
    },
  );
  it.each(['APPROVED', 'RESPONSE_TIMEOUT', 'PEER_CLOSED'])(
    'restaura solo observación después de %s, sin repetir el envío',
    async (outcome) => {
      const { connection, factory, sockets } = observing();
      const result = { outcome };
      const exchange = vi.fn(async () => {
        expect(sockets[0]!.destroyed).toBe(true);
        expect(connection.snapshot()).toMatchObject({
          state: 'DISCONNECTED',
          reason: 'TRANSACTION_STARTED',
        });
        return result;
      });
      expect(await connection.withTransaction(request.endpoint, exchange)).toBe(result);
      expect(exchange).toHaveBeenCalledOnce();
      expect(factory).toHaveBeenCalledTimes(2);
      expect(connection.snapshot().state).toBe('CONNECTING');
      sockets[1]!.emit('connect');
      expect(connection.snapshot().state).toBe('CONNECTED');
      connection.disconnect('APP_CLOSED');
    },
  );
  it.each(['USER_DISCONNECTED', 'APP_CLOSED', 'ENVIRONMENT_CHANGED'] as const)(
    'respeta %s mientras se ejecuta la transacción',
    async (reason) => {
      const { connection, factory } = observing();
      let finish!: () => void;
      let started!: () => void;
      const entered = new Promise<void>((resolve) => {
        started = resolve;
      });
      const pending = connection.withTransaction(request.endpoint, () => {
        started();
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      });
      await entered;
      await expect(
        connection.withTransaction(request.endpoint, async () => undefined),
      ).rejects.toThrow('QA_CONNECTION_BUSY');
      expect(() => connection.connect(request)).toThrow('QA_CONNECTION_BUSY');
      connection.disconnect(reason);
      finish();
      await pending;
      expect(factory).toHaveBeenCalledOnce();
      expect(connection.snapshot()).toMatchObject({ state: 'DISCONNECTED', reason });
    },
  );
  it('no abre observación si el operador no estaba conectado', async () => {
    const factory = vi.fn(() => new Socket());
    const connection = new QaSwitchConnection(factory);
    await connection.withTransaction(request.endpoint, async () => 'done');
    expect(factory).not.toHaveBeenCalled();
    expect(connection.snapshot().state).toBe('DISCONNECTED');
  });
  it('limita la restauración al plazo configurado sin reconexiones repetidas', async () => {
    vi.useFakeTimers();
    const { connection, factory } = observing();
    const exchange = vi.fn(async () => 'completed');
    expect(await connection.withTransaction(request.endpoint, exchange)).toBe('completed');
    await vi.advanceTimersByTimeAsync(501);
    expect(connection.snapshot()).toMatchObject({
      state: 'DISCONNECTED',
      reason: 'CONNECT_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(exchange).toHaveBeenCalledOnce();
  });
  it('no recupera otro destino ni altera una excepción del emisor', async () => {
    const { connection, factory } = observing();
    const error = Error('TEST_TRANSPORT_FAILURE');
    await expect(
      connection.withTransaction({ ...request.endpoint, port: 16101 }, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(factory).toHaveBeenCalledOnce();
    expect(connection.snapshot()).toMatchObject({ state: 'DISCONNECTED', reason: null });
  });
  it('un fallo de reconexión no sustituye el resultado financiero ni causa reintento', async () => {
    const { connection, factory } = observing();
    factory.mockImplementationOnce(() => {
      throw Error('SOCKET_UNAVAILABLE');
    });
    const exchange = vi.fn(async () => ({ outcome: 'APPROVED' }));
    expect(await connection.withTransaction(request.endpoint, exchange)).toEqual({
      outcome: 'APPROVED',
    });
    expect(exchange).toHaveBeenCalledOnce();
    expect(connection.snapshot()).toMatchObject({ state: 'DISCONNECTED', reason: 'SOCKET_ERROR' });
  });
  it.each([
    { ...request, environment: 'PROD' },
    { ...request, endpoint: { host: 'example.com', port: 16100 } },
    { ...request, endpoint: { host: null, port: 16100 } },
    { ...request, endpoint: { host: '127.0.0.1', port: 0 } },
    { ...request, connectDeadlineMs: 0 },
    { ...request, connectDeadlineMs: 30001 },
  ])('rechaza entrada no aprobada sin abrir socket: %j', (input) => {
    const factory = vi.fn(() => new Socket());
    expect(() =>
      new QaSwitchConnection(factory).connect(
        input as Parameters<SwitchConnectionPort['connect']>[0],
      ),
    ).toThrow('QA_CONNECTION_INVALID');
    expect(factory).not.toHaveBeenCalled();
  });
  it('vence el plazo de conexión y descarta eventos tardíos', async () => {
    vi.useFakeTimers();
    const socket = new Socket();
    vi.spyOn(socket, 'connect').mockImplementation(() => socket);
    const connection = new QaSwitchConnection(() => socket);
    connection.connect(request);
    expect(connection.snapshot().state).toBe('CONNECTING');
    await vi.advanceTimersByTimeAsync(501);
    expect(connection.snapshot()).toMatchObject({
      state: 'DISCONNECTED',
      reason: 'CONNECT_TIMEOUT',
    });
    socket.emit('connect');
    expect(connection.snapshot().state).toBe('DISCONNECTED');
  });
  it('sanitiza errores y entrega snapshots independientes', () => {
    const socket = new Socket();
    vi.spyOn(socket, 'connect').mockImplementation(() => socket);
    const connection = new QaSwitchConnection(() => socket);
    connection.connect(request);
    const copy = connection.snapshot();
    copy.endpoint!.port = 1;
    socket.emit('error', Object.assign(Error('PRIVATE_SOCKET_DETAILS'), { code: 'ECONNREFUSED' }));
    expect(connection.snapshot()).toMatchObject({
      state: 'DISCONNECTED',
      reason: 'REFUSED',
      endpoint: request.endpoint,
    });
    expect(JSON.stringify(connection.snapshot())).not.toContain('PRIVATE_SOCKET_DETAILS');
  });
});
