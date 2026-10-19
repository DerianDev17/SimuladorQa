import { randomUUID } from 'node:crypto';
import { createServer, Socket, type Server } from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { FileBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { WithdrawalService } from '../../apps/desktop/src/main/withdrawal-service';
import { WithdrawalReceiptService } from '../../apps/desktop/src/main/withdrawal-receipt-service';
import { withdrawalReceiptHtml } from '../../apps/desktop/src/main/adapters/withdrawal-receipt-html';
import { NewVisaWithdrawal } from '../../apps/desktop/src/main/adapters/new-visa-withdrawal';
import { withdrawalFixture, withdrawalResponse } from '../helpers/withdrawal';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { networkManagementRequest } from '../helpers/visa-network-management';

const runtime = {
  agentId: randomUUID(),
  hostname: 'test-station',
  user: 'test-user',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-12T20:00:00.000Z',
};
let server: Server | undefined;
let directory: string | undefined;
const peers = new Set<Socket>();
const framing = new CapturedVisaFraming();
async function listen(handler: (peer: Socket) => void) {
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
  if (server?.listening) await new Promise<void>((done) => server!.close(() => done()));
  server = undefined;
  if (directory) await removeTestDirectory(directory, 'coonecta-withdrawal-');
  directory = undefined;
});
function request(port: number) {
  const { target, lease } = withdrawalFixture();
  const built = new NewVisaWithdrawal().build(lease);
  return {
    environment: 'QA' as const,
    endpoint: { ...target.endpoint, port },
    wire: built.wire,
    expected: built.metadata,
    connectDeadlineMs: 1000,
    responseDeadlineMs: 100,
  };
}

describe('retiro sintetico por TCP local y diario persistente', () => {
  it.each([false, true])(
    'permite otra solicitud tras 91 al reiniciar (registro historico: %s)',
    async (legacy) => {
      const received: string[] = [];
      const port = await listen((peer) => {
        const decoder = framing.decoder();
        peer.on('data', (chunk) => {
          for (const frame of decoder.push(chunk)) {
            const metadata = new CapturedVisaBalance('WITHDRAWAL').inspect(frame.opaqueBody);
            received.push(metadata.stan);
            peer.end(
              framing.encode(
                withdrawalResponse(metadata, received.length === 1 ? '91' : '00'),
                Buffer.alloc(2),
              ),
            );
            frame.opaqueBody.fill(0);
          }
        });
      });
      directory = await mkdtemp(join(tmpdir(), 'coonecta-withdrawal-'));
      const path = join(directory, 'withdrawal-executions.json');
      const journal = new FileBalanceJournal(path, 'WITHDRAWAL');
      const first = withdrawalFixture();
      const next = withdrawalFixture();
      next.target.draft.atmId = first.target.draft.atmId;
      next.lease.sequence++;
      for (const input of [first, next]) {
        input.target.endpoint.port = port;
        input.lease.endpoint.port = port;
      }
      const acquire = vi.fn(async () => first.lease);
      const provider = { inspect: async () => ({ ready: true, blockers: [] }), acquire };
      const transport = new BalanceTcpTransport('WITHDRAWAL');
      const service = new WithdrawalService(journal, transport, runtime, provider);
      const deadlines = { connect: 1000, response: 1000 };
      const old = await service.execute(first.request, first.target, deadlines, async () => true);
      expect(old).toMatchObject({
        ok: true,
        value: { outcome: 'NOT_APPROVED', responseCode: '91' },
      });
      if (!old.ok) throw Error('TEST_SETUP');
      if (legacy) {
        old.value.outcome = 'REQUIRES_REVIEW';
        await journal.write([old.value]);
      }
      expect(received).toHaveLength(1);
      const restarted = new WithdrawalService(
        new FileBalanceJournal(path, 'WITHDRAWAL'),
        transport,
        runtime,
        provider,
      );
      expect(
        await restarted.execute(first.request, first.target, deadlines, async () => true),
      ).toEqual(old);
      acquire.mockResolvedValueOnce(next.lease);
      expect(
        await restarted.execute(next.request, next.target, deadlines, async () => true),
      ).toMatchObject({ ok: true, value: { outcome: 'APPROVED', responseCode: '00' } });
      expect(received).toHaveLength(2);
      expect(new Set(received).size).toBe(2);
      expect(acquire).toHaveBeenCalledTimes(2);
      expect(first.request.cardReadId).not.toBe(next.request.cardReadId);
      const stored = await journal.read();
      expect(stored).toHaveLength(2);
      expect(stored[0]).toEqual(old.value);
      expect(stored[1]!.qaContinuation).toBeUndefined();
    },
  );
  it('correlaciona una aprobacion fragmentada, preserva F4 y no repite tras reiniciar', async () => {
    let received = 0;
    const port = await listen((peer) => {
      const decoder = framing.decoder();
      peer.on('data', (chunk) => {
        received += chunk.length;
        for (const frame of decoder.push(chunk)) {
          const metadata = new CapturedVisaBalance('WITHDRAWAL').inspect(frame.opaqueBody);
          const response = framing.encode(withdrawalResponse(metadata), Buffer.alloc(2));
          peer.write(
            Buffer.concat([
              framing.encode(networkManagementRequest(), Buffer.alloc(2)),
              response.subarray(0, 9),
            ]),
          );
          setTimeout(() => peer.end(response.subarray(9)), 5);
          frame.opaqueBody.fill(0);
        }
      });
    });
    directory = await mkdtemp(join(tmpdir(), 'coonecta-withdrawal-'));
    const path = join(directory, 'withdrawal-executions.json');
    const journal = new FileBalanceJournal(path, 'WITHDRAWAL');
    const f = withdrawalFixture('20.00');
    f.target.endpoint.port = port;
    f.lease.endpoint.port = port;
    const acquire = vi.fn(async () => f.lease);
    const transport = new BalanceTcpTransport('WITHDRAWAL');
    const service = new WithdrawalService(journal, transport, runtime, {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire,
    });
    const result = await service.execute(
      f.request,
      f.target,
      { connect: 1000, response: 1000 },
      async () => true,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        outcome: 'APPROVED',
        responseCode: '00',
        withdrawal: { amount: '20.00' },
        balances: [
          { accountCode: '10', type: '02', currency: '840', amount: '123.45' },
          { accountCode: '10', type: '01', currency: '840', amount: '234.56' },
        ],
      },
    });
    if (!result.ok) throw Error('TEST_SETUP');
    expect(received).toBe(result.value.bytesQueued);
    expect(JSON.parse(await readFile(path, 'utf8')).executions).toEqual([result.value]);
    expect(
      await new WithdrawalService(journal, transport, runtime).execute(
        f.request,
        f.target,
        { connect: 1000, response: 1000 },
        async () => true,
      ),
    ).toEqual(result);
    expect(acquire).toHaveBeenCalledTimes(1);
    const restarted = new WithdrawalService(
      new FileBalanceJournal(path, 'WITHDRAWAL'),
      transport,
      runtime,
    );
    const print = vi.fn(async (receipt) => {
      expect(withdrawalReceiptHtml(receipt)).toContain('USD 123.45');
      return 'SUBMITTED' as const;
    });
    const receipts = new WithdrawalReceiptService((request) => restarted.find(request.requestId), {
      print,
    });
    const bytesBeforePrinting = received;
    expect(await receipts.print({ environment: 'QA', requestId: f.request.requestId })).toEqual({
      ok: true,
      value: 'SUBMITTED',
    });
    expect(await receipts.print({ environment: 'QA', requestId: f.request.requestId })).toEqual({
      ok: true,
      value: 'SUBMITTED',
    });
    expect(print).toHaveBeenCalledTimes(2);
    expect(received).toBe(bytesBeforePrinting);
    expect(await journal.read()).toEqual([result.value]);
    await expect(new FileBalanceJournal(path).read()).rejects.toThrow('BALANCE_JOURNAL_INVALID');
    // A crash after write retains PENDING and blocks another request, including a new UUID.
    await journal.write([
      { ...result.value, outcome: 'PENDING', finishedAt: null, responseCode: null, balances: [] },
    ]);
    expect(
      await new WithdrawalService(journal, transport, runtime).execute(
        { ...f.request, requestId: randomUUID() },
        f.target,
        { connect: 100, response: 100 },
        async () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
  });
  it.each(['96', '05', '10'])(
    'conserva %s sin asumir rechazo definitivo o aprobacion parcial',
    async (code) => {
      const port = await listen((peer) =>
        peer.once('data', () =>
          peer.end(framing.encode(withdrawalResponse(input.expected, code), Buffer.alloc(2))),
        ),
      );
      const input = request(port);
      expect(await new BalanceTcpTransport('WITHDRAWAL').exchange(input)).toMatchObject({
        outcome: 'REQUIRES_REVIEW',
        responseCode: code,
        balances: [],
        transmissionAttempted: true,
      });
    },
  );
  it.each(['missing', 'changed'])('no declara aprobacion completa con monto %s', async (mode) => {
    const port = await listen((peer) =>
      peer.once('data', () =>
        peer.end(
          framing.encode(
            withdrawalResponse(input.expected, '00', (fields) => {
              if (mode === 'missing') fields.delete(4);
              else fields.set(4, Buffer.from('0'.repeat(8) + '1000', 'hex'));
            }),
            Buffer.alloc(2),
          ),
        ),
      ),
    );
    const input = request(port);
    expect(await new BalanceTcpTransport('WITHDRAWAL').exchange(input)).toMatchObject({
      outcome: 'REQUIRES_REVIEW',
      responseCode: '00',
      transmissionAttempted: true,
    });
  });
  it('agota el plazo de respuesta sin repetir el write ni generar un reverso', async () => {
    let received = 0;
    const port = await listen((peer) =>
      peer.on('data', (chunk: Buffer) => {
        received += chunk.length;
      }),
    );
    const input = request(port);
    expect(await new BalanceTcpTransport('WITHDRAWAL').exchange(input)).toMatchObject({
      outcome: 'RESPONSE_TIMEOUT',
      transmissionAttempted: true,
    });
    expect(received).toBe(input.wire.length);
  });
  it('ignora otra correlacion y no usa la aprobacion de otra operacion', async () => {
    const port = await listen((peer) =>
      peer.once('data', () =>
        peer.write(
          framing.encode(
            withdrawalResponse({ ...input.expected, stan: '000001' }),
            Buffer.alloc(2),
          ),
        ),
      ),
    );
    const input = request(port);
    expect(await new BalanceTcpTransport('WITHDRAWAL').exchange(input)).toMatchObject({
      outcome: 'RESPONSE_TIMEOUT',
      responseCode: null,
    });
  });
  it('rechaza respuesta malformada sin mostrar datos privados', async () => {
    const port = await listen((peer) =>
      peer.once('data', () => peer.end(framing.encode(Buffer.alloc(32, 0xff), Buffer.alloc(2)))),
    );
    const input = request(port);
    const result = await new BalanceTcpTransport('WITHDRAWAL').exchange(input);
    expect(result).toMatchObject({ outcome: 'INVALID_RESPONSE', transmissionAttempted: true });
    expect(JSON.stringify(result)).not.toMatch(/pin|pan|raw|wire/i);
  });
  it('no abre TCP cuando la metadata no corresponde al monto del wire', async () => {
    const connect = vi.spyOn(Socket.prototype, 'connect');
    const input = request(1);
    input.expected.amount = '0'.repeat(8) + '3000';
    expect(await new BalanceTcpTransport('WITHDRAWAL').exchange(input)).toMatchObject({
      transmissionAttempted: false,
      bytesQueued: 0,
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it('controla destino no disponible y timeout de conexion sin write', async () => {
    const port = await listen(() => undefined);
    await new Promise<void>((done) => server!.close(() => done()));
    expect(await new BalanceTcpTransport('WITHDRAWAL').exchange(request(port))).toMatchObject({
      outcome: 'TRANSPORT_ERROR',
      transmissionAttempted: false,
    });
    vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (this: Socket) {
      return this;
    });
    expect(
      await new BalanceTcpTransport('WITHDRAWAL').exchange({
        ...request(port),
        connectDeadlineMs: 10,
      }),
    ).toMatchObject({ outcome: 'CONNECT_TIMEOUT', transmissionAttempted: false });
  });
});
