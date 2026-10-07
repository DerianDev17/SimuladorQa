import { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QaTcpReplay } from '../../apps/desktop/src/main/adapters/qa-tcp-replay';
import type { QaReplayRequest } from '../../apps/desktop/src/main/qa-replay-port';
import { qaReplayRequest } from '../helpers/qa-replay';

afterEach(() => vi.restoreAllMocks());

describe('emisor unico QA: guard y disponibilidad', () => {
  it.each([
    { environment: 'PREPROD' },
    { environment: 'PROD' },
    { endpoint: { host: 'https://host', port: 16100 } },
    { endpoint: { host: '127.0.0.1', port: 65536 } },
    { wireBytes: Uint8Array.of() },
    { wireBytes: new Uint8Array(65536) },
    { connectDeadlineMs: 0 },
    { observationWindowMs: 30001 },
  ])('bloquea entrada invalida antes de abrir sockets %j', async (patch) => {
    const connect = vi.spyOn(Socket.prototype, 'connect');
    const request = { ...qaReplayRequest(), ...patch } as unknown as QaReplayRequest;
    expect(await new QaTcpReplay().sendOnce(request)).toMatchObject({
      outcome: 'BLOCKED',
      writeAttempted: false,
      bytesQueued: 0,
      bytesReceived: 0,
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it('agota una conexion pendiente sin write ni reconexion', async () => {
    const connect = vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (
      this: Socket,
    ) {
      return this;
    });
    const result = await new QaTcpReplay().sendOnce({
      ...qaReplayRequest(),
      connectDeadlineMs: 20,
    });
    expect(result).toEqual({
      outcome: 'CONNECT_TIMEOUT',
      writeAttempted: false,
      writeCompleted: false,
      bytesQueued: 0,
      bytesReceived: 0,
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect.mock.instances[0]).toHaveProperty('destroyed', true);
  });
  it('protege mensajes de error y no reintenta la conexion', async () => {
    const connect = vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (
      this: Socket,
    ) {
      queueMicrotask(() =>
        this.emit('error', Object.assign(new Error('private-secret'), { code: 'ECONNREFUSED' })),
      );
      return this;
    });
    const result = await new QaTcpReplay().sendOnce(qaReplayRequest());
    expect(result).toMatchObject({
      outcome: 'SOCKET_ERROR',
      errorCode: 'REFUSED',
      writeAttempted: false,
    });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
