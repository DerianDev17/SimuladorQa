import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { QaTcpReplay } from '../../apps/desktop/src/main/adapters/qa-tcp-replay';
import { qaReplayRequest } from '../helpers/qa-replay';

let server: Server | undefined;
const peers = new Set<Socket>();
async function listen(handler: (peer: Socket) => void): Promise<number> {
  server = createServer((peer) => {
    peers.add(peer);
    peer.on('error', () => {});
    peer.once('close', () => peers.delete(peer));
    handler(peer);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('TEST_SERVER_UNAVAILABLE');
  return address.port;
}
afterEach(async () => {
  for (const peer of peers) peer.destroy();
  peers.clear();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

describe('envio unico sobre TCP real local', () => {
  it('envia los bytes originales una vez y cuenta la respuesta sin conservarla', async () => {
    const received: Buffer[] = [];
    let connections = 0;
    const port = await listen((peer) => {
      connections++;
      peer.on('data', (data: Buffer) => {
        received.push(Buffer.from(data));
        if (Buffer.concat(received).byteLength === 4) {
          peer.write(Buffer.of(1));
          peer.end(Buffer.of(2, 3));
        }
      });
    });
    const request = qaReplayRequest(port);
    const pending = new QaTcpReplay().sendOnce(request);
    request.wireBytes.fill(9);
    const result = await pending;
    expect(Buffer.concat(received)).toEqual(Buffer.of(1, 2, 3, 4));
    expect(connections).toBe(1);
    expect(result).toEqual({
      outcome: 'PEER_CLOSED',
      writeAttempted: true,
      writeCompleted: true,
      bytesQueued: 4,
      bytesReceived: 3,
    });
    expect(Object.keys(result)).not.toContain('response');
  });
  it('termina la ventana sin respuesta tras un solo envio, sin retries', async () => {
    let total = 0;
    let connections = 0;
    const port = await listen((peer) => {
      connections++;
      peer.on('data', (data: Buffer) => {
        total += data.byteLength;
      });
    });
    expect(await new QaTcpReplay().sendOnce(qaReplayRequest(port))).toEqual({
      outcome: 'OBSERVATION_ENDED',
      writeAttempted: true,
      writeCompleted: true,
      bytesQueued: 4,
      bytesReceived: 0,
    });
    expect(total).toBe(4);
    expect(connections).toBe(1);
  });
  it('controla dependencia no disponible sin intentar write', async () => {
    const port = await listen(() => {});
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    expect(await new QaTcpReplay().sendOnce(qaReplayRequest(port))).toMatchObject({
      outcome: 'SOCKET_ERROR',
      errorCode: 'REFUSED',
      writeAttempted: false,
      bytesQueued: 0,
    });
  });
  it('limita observacion de respuestas grandes sin exponer su contenido', async () => {
    const port = await listen((peer) => {
      peer.once('data', () => peer.end(Buffer.alloc(65536)));
    });
    const result = await new QaTcpReplay().sendOnce(qaReplayRequest(port));
    expect(result.outcome).toBe('RECEIVE_LIMIT');
    expect(result.bytesReceived).toBeGreaterThan(65535);
    expect(Object.keys(result)).not.toContain('response');
  });
});
