import { createServer, Socket } from 'node:net';
import type { Server } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { NewVisaBalance } from '../../apps/desktop/src/main/adapters/new-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import type { BalanceExchangeRequest } from '../../apps/desktop/src/main/balance-ports';
import { balanceTarget, balanceLease, balanceResponse } from '../helpers/balance-inquiry';
import { networkManagementRequest } from '../helpers/visa-network-management';

let server: Server | undefined;
const peers = new Set<Socket>();
async function listen(handler: (peer: Socket) => void): Promise<number> {
  server = createServer((peer) => {
    peers.add(peer);
    peer.on('error', () => undefined);
    peer.once('close', () => peers.delete(peer));
    handler(peer);
  });
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('TEST_SERVER_UNAVAILABLE');
  return address.port;
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const peer of peers) peer.destroy();
  peers.clear();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});
function request(port: number): BalanceExchangeRequest {
  const target = balanceTarget();
  target.endpoint.port = port;
  const built = new NewVisaBalance().build(balanceLease(target));
  return {
    environment: 'QA',
    endpoint: target.endpoint,
    wire: built.wire,
    expected: built.metadata,
    connectDeadlineMs: 1000,
    responseDeadlineMs: 500,
  };
}
const framing = new CapturedVisaFraming();
describe('consulta financiera TCP en loopback con datos sinteticos', () => {
  it('excluye del tiempo de transporte la espera TPS y empieza el timeout al escribir', async () => {
    let gateWaitMs = 0;
    const port = await listen((peer) =>
      peer.once('data', () => {
        peer.end(framing.encode(balanceResponse(input.expected), Buffer.alloc(2)));
      }),
    );
    const input: BalanceExchangeRequest = {
      ...request(port),
      responseDeadlineMs: 200,
      withWrite: async (write) => {
        const gateStarted = performance.now();
        await new Promise((resolve) => setTimeout(resolve, 300));
        gateWaitMs = performance.now() - gateStarted;
        write();
      },
    };
    const started = performance.now();
    const result = await new BalanceTcpTransport().exchange(input);
    expect(result.outcome).toBe('APPROVED');
    expect(performance.now() - started).toBeGreaterThanOrEqual(290);
    expect(performance.now() - started - result.elapsedMs).toBeGreaterThanOrEqual(gateWaitMs - 20);
  });
  it.each(['CANCEL', 'EXPIRED'] as const)(
    'no escribe si el permiso de carga termina por %s',
    async (reason) => {
      let bytes = 0;
      const port = await listen((peer) =>
        peer.on('data', (chunk) => {
          bytes += chunk.length;
        }),
      );
      const abort = new AbortController();
      let release!: () => void;
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const pending = new BalanceTcpTransport().exchange({
        ...request(port),
        signal: abort.signal,
        withWrite: async (write) => {
          entered();
          await gate;
          if (reason === 'EXPIRED') throw Error('CONTEXT_CHANGED');
          write();
        },
      });
      await ready;
      if (reason === 'CANCEL') abort.abort();
      release();
      expect(await pending).toMatchObject({ transmissionAttempted: false, bytesQueued: 0 });
      await vi.waitFor(() => expect(peers.size).toBe(0));
      expect(bytes).toBe(0);
    },
  );
  it('detener carga cierra el socket y conserva evidencia de un envío sin respuesta', async () => {
    const abort = new AbortController();
    const port = await listen((peer) => peer.once('data', () => abort.abort()));
    const input = { ...request(port), signal: abort.signal, responseDeadlineMs: 30000 };
    const result = await new BalanceTcpTransport().exchange(input);
    expect(result).toMatchObject({
      outcome: 'TRANSPORT_ERROR',
      transmissionAttempted: true,
      responseCode: null,
    });
    expect(result.bytesQueued).toBeGreaterThan(0);
    await vi.waitFor(() => expect(peers.size).toBe(0));
    expect(await new BalanceTcpTransport().exchange(input)).toMatchObject({
      transmissionAttempted: false,
      bytesQueued: 0,
    });
  });
  it('correlaciona respuesta fragmentada y separa gestión de red sin responder 0810', async () => {
    let received = 0,
      connections = 0;
    const port = await listen((peer) => {
      connections++;
      peer.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received !== input.wire.length) return;
        const response = framing.encode(balanceResponse(input.expected), Buffer.alloc(2));
        peer.write(
          Buffer.concat([
            framing.encode(networkManagementRequest(), Buffer.of(0x20, 0x20)),
            response.subarray(0, 9),
          ]),
        );
        setTimeout(() => peer.end(response.subarray(9)), 10);
      });
    });
    const input = request(port);
    const result = await new BalanceTcpTransport().exchange(input);
    expect(result).toMatchObject({
      outcome: 'APPROVED',
      transmissionAttempted: true,
      responseCode: '00',
      balances: [
        { type: '02', amount: '123.45' },
        { type: '01', amount: '234.56' },
      ],
    });
    expect(received).toBe(input.wire.length);
    expect(connections).toBe(1);
    expect(JSON.stringify(result)).not.toMatch(/pan|wire|raw|pin/i);
  });
  it.each(['91', '96'])(
    'devuelve código %s sin asignarlo a error local ni fabricar saldo',
    async (code) => {
      const port = await listen((peer) =>
        peer.once('data', () =>
          peer.end(framing.encode(balanceResponse(input.expected, code), Buffer.alloc(2))),
        ),
      );
      const input = request(port);
      expect(await new BalanceTcpTransport().exchange(input)).toMatchObject({
        outcome: 'NOT_APPROVED',
        responseCode: code,
        balances: [],
        transmissionAttempted: true,
      });
    },
  );
  it('ignora respuesta no correlacionada y espera solo hasta el plazo', async () => {
    let received = 0;
    const port = await listen((peer) =>
      peer.on('data', (data: Buffer) => {
        received += data.length;
        if (received === input.wire.length)
          peer.write(
            framing.encode(balanceResponse({ ...input.expected, stan: '000001' }), Buffer.alloc(2)),
          );
      }),
    );
    const input = request(port);
    expect(await new BalanceTcpTransport().exchange(input)).toMatchObject({
      outcome: 'RESPONSE_TIMEOUT',
      transmissionAttempted: true,
      responseCode: null,
    });
    expect(received).toBe(input.wire.length);
  });
  it('reconoce 0210/96 con F44 del layout NWINT sin convertirlo en INVALID_RESPONSE', async () => {
    const port = await listen((peer) =>
      peer.once('data', () => {
        // Public layout from STAN 900107; all card/private values remain synthetic.
        const body = balanceResponse(input.expected, '96', (fields) => {
          fields.delete(54);
          fields.set(44, Buffer.of(5, 0x40, 0x40, 0x40, 0x40, 0xf2));
          fields.set(55, Buffer.concat([Buffer.of(8), Buffer.alloc(8)]));
        });
        expect(body.length).toBe(157);
        const wire = framing.encode(body, Buffer.alloc(2));
        peer.write(wire.subarray(0, 100));
        setTimeout(() => peer.end(wire.subarray(100)), 10);
      }),
    );
    const input = request(port);
    expect(await new BalanceTcpTransport().exchange(input)).toMatchObject({
      outcome: 'NOT_APPROVED',
      responseCode: '96',
      balances: [],
      transmissionAttempted: true,
      bytesQueued: input.wire.length,
    });
  });
  it('rechaza aprobación sin saldo, codificación inválida y framing incompleto', async () => {
    for (const mode of ['missing', 'encoding', 'truncated']) {
      const port = await listen((peer) =>
        peer.once('data', () => {
          const body = balanceResponse(input.expected, '00', (fields) => {
            if (mode === 'missing') fields.delete(54);
            if (mode === 'encoding') fields.get(54)![1] = 0xff;
          });
          const wire = framing.encode(body, Buffer.alloc(2));
          peer.end(mode === 'truncated' ? wire.subarray(0, 20) : wire);
        }),
      );
      const input = request(port);
      expect(await new BalanceTcpTransport().exchange(input)).toMatchObject({
        outcome: mode === 'truncated' ? 'PEER_CLOSED' : 'INVALID_RESPONSE',
        transmissionAttempted: true,
        balances: [],
      });
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = undefined;
    }
  });
  it('controla destino no disponible sin write y bloqueo de PROD antes del socket', async () => {
    const port = await listen(() => undefined);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    const input = request(port);
    expect(await new BalanceTcpTransport().exchange(input)).toMatchObject({
      outcome: 'TRANSPORT_ERROR',
      transmissionAttempted: false,
    });
    const connect = vi.spyOn(Socket.prototype, 'connect');
    expect(
      await new BalanceTcpTransport().exchange({ ...input, environment: 'PROD' } as never),
    ).toMatchObject({ transmissionAttempted: false });
    expect(connect).not.toHaveBeenCalled();
  });
  it('agota conexión pendiente sin transmisión', async () => {
    vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (this: Socket) {
      return this;
    });
    expect(
      await new BalanceTcpTransport().exchange({ ...request(16100), connectDeadlineMs: 10 }),
    ).toMatchObject({ outcome: 'CONNECT_TIMEOUT', transmissionAttempted: false, bytesQueued: 0 });
  });
});
