import { createServer } from 'node:net';
import type { Server, Socket, AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { QaSwitchConnection } from '../../apps/desktop/src/main/adapters/qa-switch-connection';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { networkManagementRequest } from '../helpers/visa-network-management';

let server: Server | undefined;
let connection: QaSwitchConnection | undefined;
const peers = new Set<Socket>();
let written = 0;
async function listen(handler: (peer: Socket) => void) {
  server = createServer((peer) => {
    peers.add(peer);
    peer.on('error', () => {});
    peer.on('data', (chunk) => {
      written += chunk.length;
    });
    peer.once('close', () => peers.delete(peer));
    handler(peer);
  });
  await new Promise<void>((done) => server!.listen(0, '127.0.0.1', done));
  return {
    environment: 'QA' as const,
    endpoint: { host: '127.0.0.1', port: (server.address() as AddressInfo).port },
    connectDeadlineMs: 200,
  };
}
afterEach(async () => {
  connection?.disconnect('APP_CLOSED');
  for (const peer of peers) peer.destroy();
  peers.clear();
  if (server?.listening) await new Promise<void>((done) => server!.close(() => done()));
  expect(written).toBe(0);
  written = 0;
});
describe('conexión persistente sin respuesta ISO inventada', () => {
  it('mantiene la conexión tras recibir 0800 fragmentado y tras vencer el plazo inicial', async () => {
    const wire = new CapturedVisaFraming().encode(
      networkManagementRequest(),
      Buffer.of(0x20, 0x20),
    );
    let connections = 0;
    const request = await listen((peer) => {
      connections++;
      peer.write(wire.subarray(0, 3));
      setTimeout(() => peer.write(wire.subarray(3)), 10);
    });
    connection = new QaSwitchConnection();
    connection.connect(request);
    await expect.poll(() => connection!.snapshot().networkMessage?.code).toBe('072');
    const first = connection.snapshot();
    connection.connect(request);
    await new Promise((done) => setTimeout(done, 250));
    expect(connection.snapshot()).toMatchObject({
      state: 'CONNECTED',
      connectionId: first.connectionId,
      bytesReceived: 60,
    });
    expect(connections).toBe(1);
    expect(connection.snapshot().localEndpoint?.address).toBe('127.0.0.1');
    expect(JSON.stringify(first)).not.toMatch(/12345|654321|opaqueBody/);
    connection.disconnect('USER_DISCONNECTED');
    expect(connection.snapshot()).toMatchObject({
      state: 'DISCONNECTED',
      reason: 'USER_DISCONNECTED',
    });
    connection.connect(request);
    await expect.poll(() => connection!.snapshot().state).toBe('CONNECTED');
    expect(connection.snapshot().connectionId).not.toBe(first.connectionId);
  });
  it('actualiza el estado cuando el servidor cierra y permite reconexión manual', async () => {
    const request = await listen((peer) => setTimeout(() => peer.end(), 20));
    connection = new QaSwitchConnection();
    connection.connect(request);
    await expect.poll(() => connection!.snapshot().reason).toBe('PEER_CLOSED');
    expect(connection.snapshot().state).toBe('DISCONNECTED');
    expect(connection.snapshot().connectedAt).not.toBeNull();
  });
  it('detecta rechazo de acceso fragmentado sin presentar conexión activa', async () => {
    const request = await listen((peer) => {
      peer.write('NO AUTH');
      setTimeout(() => peer.write('ORIZATION\r\n'), 10);
    });
    connection = new QaSwitchConnection();
    connection.connect(request);
    await expect.poll(() => connection!.snapshot().reason).toBe('ADMISSION_DENIED');
    expect(connection.snapshot().state).toBe('DISCONNECTED');
  });
  it('limita datos desconocidos y no publica el contenido recibido', async () => {
    const wire = new CapturedVisaFraming().encode(
      Buffer.from('PRIVATE_UNSUPPORTED'),
      Buffer.alloc(2),
    );
    const request = await listen((peer) => peer.write(wire));
    connection = new QaSwitchConnection();
    connection.connect(request);
    await expect.poll(() => connection!.snapshot().reason).toBe('UNSUPPORTED_FRAME');
    expect(JSON.stringify(connection.snapshot())).not.toContain('PRIVATE_UNSUPPORTED');
  });
});
