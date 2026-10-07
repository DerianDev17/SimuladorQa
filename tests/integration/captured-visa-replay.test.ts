import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { QaTcpReplay } from '../../apps/desktop/src/main/adapters/qa-tcp-replay';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { qaReplayRequest } from '../helpers/qa-replay';

let server: Server | undefined;
const peers = new Set<Socket>();
afterEach(async () => {
  for (const peer of peers) peer.destroy();
  peers.clear();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});
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

describe('emisor QA con envolvente VISA sobre TCP local', () => {
  it('entrega un frame completo y observa una respuesta fragmentada sin publicarla', async () => {
    const framing = new CapturedVisaFraming();
    const decoder = framing.decoder();
    const received: Buffer[] = [];
    let connections = 0;
    const port = await listen((peer) => {
      connections++;
      peer.on('data', (data: Buffer) => {
        received.push(Buffer.from(data));
        const messages = decoder.push(data);
        if (!messages.length) return;
        const response = framing.encode(Buffer.of(7, 8), Buffer.of(0x20, 0x20));
        peer.write(response.subarray(0, 3));
        setTimeout(() => peer.end(response.subarray(3)), 10);
      });
    });
    const wireBytes = framing.encode(Buffer.of(1, 2, 3), Buffer.of(0, 0));
    const result = await new QaTcpReplay().sendOnce({ ...qaReplayRequest(port), wireBytes });
    decoder.finish();
    expect(Buffer.concat(received)).toEqual(wireBytes);
    expect(connections).toBe(1);
    expect(result).toMatchObject({
      outcome: 'PEER_CLOSED',
      writeCompleted: true,
      bytesQueued: 7,
      bytesReceived: 6,
    });
    expect(Object.keys(result)).not.toContain('response');
  });
  it('cierra por plazo si un receptor espera completar una fuente incompleta', async () => {
    const decoder = new CapturedVisaFraming().decoder();
    const messages: unknown[] = [];
    const port = await listen((peer) =>
      peer.on('data', (data: Buffer) => messages.push(...decoder.push(data))),
    );
    const result = await new QaTcpReplay().sendOnce({
      ...qaReplayRequest(port),
      wireBytes: Buffer.of(0, 3, 0, 0, 1),
    });
    expect(result.outcome).toBe('OBSERVATION_ENDED');
    expect(messages).toHaveLength(0);
    expect(() => decoder.finish()).toThrow('FRAME_INCOMPLETE');
  });
});
