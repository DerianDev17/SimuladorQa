import { Buffer } from 'node:buffer';
import { createServer } from 'node:net';
import type { Socket } from 'node:net';
import { expect, it } from 'vitest';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { QaTcpReplay } from '../../apps/desktop/src/main/adapters/qa-tcp-replay';
import { capturedBalanceRequest, capturedBalanceResponse } from '../helpers/captured-visa-balance';
import { qaReplayRequest } from '../helpers/qa-replay';

it('entrega una sola consulta reconstruida y observa una respuesta fragmentada en TCP local', async () => {
  const codec = new CapturedVisaBalance(),
    framing = new CapturedVisaFraming(),
    decoder = framing.decoder();
  const request = capturedBalanceRequest(),
    wire = framing.encode(codec.rebuildRequest(request), Buffer.of(0, 0));
  const received: Buffer[] = [],
    peers = new Set<Socket>();
  let connects = 0;
  const server = createServer((peer) => {
    connects++;
    peers.add(peer);
    peer.on('error', () => {});
    peer.on('data', (data: Buffer) => {
      received.push(Buffer.from(data));
      const frames = decoder.push(data);
      if (!frames.length) return;
      expect(codec.inspect(frames[0]!.opaqueBody).stan).toBe('007923');
      const reply = framing.encode(capturedBalanceResponse(), Buffer.of(0x20, 0x20));
      peer.write(reply.subarray(0, 3));
      setTimeout(() => peer.end(reply.subarray(3)), 10);
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('TEST_SERVER_UNAVAILABLE');
    const result = await new QaTcpReplay().sendOnce({
      ...qaReplayRequest(address.port),
      wireBytes: wire,
    });
    decoder.finish();
    expect(Buffer.concat(received)).toEqual(wire);
    expect(connects).toBe(1);
    expect(result).toMatchObject({
      outcome: 'PEER_CLOSED',
      writeAttempted: true,
      writeCompleted: true,
      bytesQueued: 536,
      bytesReceived: 208,
    });
    expect(result).not.toHaveProperty('response');
  } finally {
    for (const peer of peers) peer.destroy();
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
