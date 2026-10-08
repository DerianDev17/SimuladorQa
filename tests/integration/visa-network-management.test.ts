import { Buffer } from 'node:buffer';
import { createServer } from 'node:net';
import type { Server, Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { QaNetworkProbe } from '../../apps/desktop/src/main/adapters/qa-network-probe';
import { VisaNetworkManagement } from '../../apps/desktop/src/main/adapters/visa-network-management';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { networkManagementRequest } from '../helpers/visa-network-management';
import type { QaNetworkProbeRequest } from '../../apps/desktop/src/main/qa-network-probe-port';

let server: Server | undefined;
const peers = new Set<Socket>();
let bytesFromClient = 0;
afterEach(async () => {
  for (const peer of peers) peer.destroy();
  peers.clear();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  expect(bytesFromClient).toBe(0);
  bytesFromClient = 0;
});
async function listen(handler: (peer: Socket) => void): Promise<number> {
  server = createServer((peer) => {
    peers.add(peer);
    peer.on('error', () => {});
    peer.on('data', (data: Buffer) => {
      bytesFromClient += data.length;
    });
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
function observe(port: number, deadlineMs = 500) {
  return new QaNetworkProbe().observe({
    environment: 'QA',
    endpoint: { host: '127.0.0.1', port },
    deadlineMs,
  });
}
function frame() {
  return new CapturedVisaFraming().encode(networkManagementRequest(), Buffer.of(0x20, 0x20));
}

describe('gestion VISA acotada y diagnostico TCP QA', () => {
  it('observa un request fragmentado sin transmitir ni exponer datos privados', async () => {
    const wire = frame();
    const port = await listen((peer) => {
      peer.write(wire.subarray(0, 3));
      setTimeout(() => peer.write(wire.subarray(3)), 10);
    });
    const result = await observe(port);
    expect(result).toMatchObject({
      outcome: 'NETWORK_MANAGEMENT_RECEIVED',
      connected: true,
      writeAttempted: false,
      bytesWritten: 0,
      bytesReceived: 60,
      framingComplete: true,
      messages: [{ mti: '0800', stan: '654321', networkCode: '072' }],
    });
    expect(result.runId).toMatch(/^[a-f0-9-]{36}$/);
    expect(result.startedAt).toMatch(/Z$/);
    expect(result.finishedAt >= result.startedAt).toBe(true);
    expect(JSON.stringify(result)).not.toContain('12345');
    expect(result).not.toHaveProperty('raw');
    expect(result).not.toHaveProperty('response');
  });
  it('decodifica requests concatenados y construye offline un 0810 correlacionado con codigo explicito', async () => {
    const port = await listen((peer) => peer.write(Buffer.concat([frame(), frame()])));
    const result = await observe(port);
    expect(result.messages).toHaveLength(2);
    const request = networkManagementRequest();
    const reply = new VisaNetworkManagement().reply(request, '15');
    const framing = new CapturedVisaFraming();
    const decoder = framing.decoder();
    const wire = framing.encode(reply.body, Buffer.of(0, 0));
    expect(decoder.push(wire.subarray(0, 5))).toEqual([]);
    const [decoded] = decoder.push(wire.subarray(5));
    decoder.finish();
    expect(decoded!.opaqueBody).toEqual(reply.body);
    expect(decoded!.opaqueBody.subarray(48, 50)).toEqual(Buffer.of(0xf1, 0xf5));
    expect(reply.metadata.stan).toBe(result.messages[0]!.stan);
    // Synthetic transport roundtrip: not a provider-approved response or live send.
  });
  it('rechaza un mensaje financiero sin crear respuesta', async () => {
    const request = networkManagementRequest();
    request.writeUInt16BE(0x0200, 22);
    const wire = new CapturedVisaFraming().encode(request, Buffer.of(0x20, 0x20));
    const port = await listen((peer) => peer.write(wire));
    expect(await observe(port)).toMatchObject({ outcome: 'UNSUPPORTED_FRAME', messages: [] });
  });
  it('identifica el codigo 071 de la fuente QA actual sin responder', async () => {
    const request = networkManagementRequest();
    request.writeUInt16BE(0x0071, 54);
    const wire = new CapturedVisaFraming().encode(request, Buffer.of(0x20, 0x20));
    const port = await listen((peer) => peer.write(wire));
    expect(await observe(port)).toMatchObject({
      outcome: 'NETWORK_MANAGEMENT_RECEIVED',
      messages: [{ networkCode: '071' }],
      bytesWritten: 0,
    });
  });
  it('detecta denegacion textual fragmentada sin tratarla como ISO', async () => {
    const port = await listen((peer) => {
      peer.write('NO AUTH');
      setTimeout(() => peer.write('ORIZATION\r\n'), 10);
    });
    expect(await observe(port)).toMatchObject({ outcome: 'ADMISSION_DENIED', messages: [] });
  });
  it('termina por plazo cuando un peer no envia mensajes', async () => {
    const port = await listen(() => {});
    expect(await observe(port, 30)).toMatchObject({
      outcome: 'OBSERVATION_ENDED',
      connected: true,
      bytesReceived: 0,
      framingComplete: true,
    });
  });
  it('detecta cierre con frame incompleto', async () => {
    const port = await listen((peer) => peer.end(frame().subarray(0, 10)));
    expect(await observe(port)).toMatchObject({
      outcome: 'PEER_CLOSED',
      framingComplete: false,
      messages: [],
    });
  });
  it('acota bytes recibidos de un peer no soportado', async () => {
    const port = await listen((peer) => peer.write(Buffer.alloc(4097)));
    expect(await observe(port)).toMatchObject({ outcome: 'RECEIVE_LIMIT', messages: [] });
  });
  it('informa dependencia no disponible sin mensaje del driver', async () => {
    const port = await listen(() => {});
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    expect(await observe(port)).toMatchObject({
      outcome: 'SOCKET_ERROR',
      errorCode: 'REFUSED',
      connected: false,
    });
  });
  it('bloquea ambiente y entrada invalidos antes de conectar', async () => {
    const probe = new QaNetworkProbe();
    expect(
      await probe.observe({
        environment: 'PROD' as QaNetworkProbeRequest['environment'],
        endpoint: { host: '127.0.0.1', port: 1 },
        deadlineMs: 30,
      }),
    ).toMatchObject({ outcome: 'BLOCKED', errorCode: 'QA_ONLY', connected: false });
    expect(
      await probe.observe({
        environment: 'QA',
        endpoint: { host: 'invalid', port: 1 },
        deadlineMs: 30,
      }),
    ).toMatchObject({ outcome: 'BLOCKED', errorCode: 'INVALID_INPUT', connected: false });
    expect(
      await probe.observe({
        environment: 'QA',
        endpoint: { host: '127.0.0.1', port: 1 },
        deadlineMs: 30001,
      }),
    ).toMatchObject({ outcome: 'BLOCKED', errorCode: 'INVALID_INPUT', connected: false });
  });
});
