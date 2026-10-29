import { createServer, type Server, type Socket } from 'node:net';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WithdrawalReversalTransport } from '../../apps/desktop/src/main/adapters/withdrawal-reversal-transport';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { QaSwitchConnection } from '../../apps/desktop/src/main/adapters/qa-switch-connection';
import { NewVisaWithdrawal } from '../../apps/desktop/src/main/adapters/new-visa-withdrawal';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { FileBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { WithdrawalService } from '../../apps/desktop/src/main/withdrawal-service';
import { withdrawalBlocksNewExecution } from '../../packages/domain/src/balance-inquiry';
import type { ReversalProgress } from '../../packages/domain/src/withdrawal-reversal';
import { reversalFixture, reversalResponse } from '../helpers/withdrawal-reversal';
import { withdrawalResponse } from '../helpers/withdrawal';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { networkManagementRequest } from '../helpers/visa-network-management';

const framing = new CapturedVisaFraming();
let server: Server | undefined, directory: string | undefined;
const peers = new Set<Socket>();
const observations = new Set<QaSwitchConnection>();
async function observe(port: number) {
  const connection = new QaSwitchConnection();
  observations.add(connection);
  connection.connect({
    environment: 'QA',
    endpoint: { host: '127.0.0.1', port },
    connectDeadlineMs: 1000,
  });
  await expect.poll(() => connection.snapshot().state).toBe('CONNECTED');
  return connection;
}
async function listen(handler: (peer: Socket, body: Buffer) => void) {
  server = createServer((peer) => {
    peers.add(peer);
    peer.on('error', () => undefined);
    peer.once('close', () => peers.delete(peer));
    const decoder = framing.decoder();
    peer.on('data', (chunk) => {
      for (const frame of decoder.push(chunk)) {
        handler(peer, frame.opaqueBody);
        frame.opaqueBody.fill(0);
      }
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('TEST_SETUP');
  return address.port;
}
function request(port: number) {
  const built = new NewVisaWithdrawal().build(reversalFixture().lease);
  const progress: ReversalProgress[] = [];
  return {
    ...built,
    progress,
    environment: 'QA' as const,
    endpoint: { host: '127.0.0.1', port },
    expected: built.metadata,
    connectDeadlineMs: 1000,
    responseDeadlineMs: 200,
    reversal: {
      delaySeconds: 1,
      persist: async (p: ReversalProgress) => {
        progress.push(p);
      },
    },
  };
}
afterEach(async () => {
  for (const connection of observations) connection.disconnect('APP_CLOSED');
  observations.clear();
  for (const peer of peers) peer.destroy();
  peers.clear();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  if (directory) await removeTestDirectory(directory, 'coonecta-reversal-');
  directory = undefined;
});

describe('retiro, espera y reverso en TCP loopback', () => {
  it('envía 0200/0420 una sola vez; acepta fragmentación, ignora duplicado y correlaciona F90', async () => {
    const received: number[] = [];
    let approvedAt = 0,
      reversedAt = 0;
    const port = await listen((peer, body) => {
      const mti = body.readUInt16BE(22);
      received.push(mti);
      if (mti === 0x0200) {
        const metadata = new CapturedVisaBalance('WITHDRAWAL').inspect(body);
        const reply = framing.encode(withdrawalResponse(metadata), Buffer.alloc(2));
        peer.write(reply.subarray(0, 9));
        setTimeout(() => {
          approvedAt = Date.now();
          peer.write(
            Buffer.concat([
              reply.subarray(9),
              reply,
              framing.encode(networkManagementRequest(), Buffer.alloc(2)),
            ]),
          );
        }, 10);
      } else {
        reversedAt = Date.now();
        const wrong = reversalResponse(body, '00', (fields) => {
          fields.get(90)![0] = fields.get(90)![0]! ^ 1;
        });
        const good = framing.encode(reversalResponse(body), Buffer.alloc(2));
        peer.write(Buffer.concat([framing.encode(wrong, Buffer.alloc(2)), good.subarray(0, 7)]));
        setTimeout(() => peer.end(good.subarray(7)), 5);
      }
    });
    const r = request(port);
    const result = await new WithdrawalReversalTransport().exchange(r);
    expect(received).toEqual([0x0200, 0x0420]);
    expect(reversedAt - approvedAt).toBeGreaterThanOrEqual(950);
    expect(r.progress.map((p) => p.outcome)).toEqual(['WAITING', 'SENDING']);
    expect(result).toMatchObject({
      outcome: 'APPROVED',
      responseCode: '00',
      reversal: { outcome: 'APPROVED', responseCode: '00', transmissionAttempted: true },
    });
    expect(result.reversal!.bytesQueued).toBeGreaterThan(0);
    expect(result.bytesQueued).toBe(r.wire.length);
    expect(result.reversal?.messages?.request.mti).toBe('0420');
    expect(result.reversal?.messages?.response?.mti).toBe('0430');
    expect(r.progress[1]?.messages?.response).toBeUndefined();
  });
  it.each(['decline', 'withdrawal-timeout', 'close-wait', 'reversal-timeout', 'reversal-decline'])(
    'conserva ambos resultados sin reintentar: %s',
    async (mode) => {
      const received: number[] = [];
      const port = await listen((peer, body) => {
        const mti = body.readUInt16BE(22);
        received.push(mti);
        if (mti === 0x0200) {
          if (mode === 'withdrawal-timeout') return;
          const metadata = new CapturedVisaBalance('WITHDRAWAL').inspect(body);
          const response = framing.encode(
            withdrawalResponse(metadata, mode === 'decline' ? '91' : '00'),
            Buffer.alloc(2),
          );
          if (mode === 'close-wait') peer.end(response);
          else peer.write(response);
        } else if (mode === 'reversal-decline')
          peer.end(framing.encode(reversalResponse(body, '91'), Buffer.alloc(2)));
      });
      const connection = await observe(port);
      const r = request(port);
      const persist = r.reversal.persist;
      r.reversal.persist = async (progress) => {
        expect(connection.snapshot()).toMatchObject({
          state: 'DISCONNECTED',
          reason: 'TRANSACTION_STARTED',
        });
        await persist(progress);
      };
      const result = await connection
        .manageTransport(new WithdrawalReversalTransport())
        .exchange(r);
      await expect.poll(() => connection.snapshot().state).toBe('CONNECTED');
      const sent = mode.startsWith('reversal-');
      expect(received).toEqual(sent ? [0x0200, 0x0420] : [0x0200]);
      expect(result.reversal?.outcome).toBe(
        mode === 'reversal-decline' ? 'NOT_APPROVED' : sent ? 'UNCONFIRMED' : 'NOT_SENT',
      );
      expect(result.outcome).toBe(
        mode === 'decline'
          ? 'NOT_APPROVED'
          : mode === 'withdrawal-timeout'
            ? 'RESPONSE_TIMEOUT'
            : 'APPROVED',
      );
      expect(result.reversal?.messages?.request.mti).toBe(sent ? '0420' : undefined);
      expect(result.reversal?.messages?.response?.mti).toBe(
        mode === 'reversal-decline' ? '0430' : undefined,
      );
    },
  );
  it.each(['WAITING', 'SENDING'])('no envía reverso si falla persistencia en %s', async (phase) => {
    const received: number[] = [];
    const port = await listen((peer, body) => {
      received.push(body.readUInt16BE(22));
      const metadata = new CapturedVisaBalance('WITHDRAWAL').inspect(body);
      peer.write(framing.encode(withdrawalResponse(metadata), Buffer.alloc(2)));
    });
    const r = request(port);
    r.reversal.persist = async (p) => {
      if (p.outcome === phase) throw Error('STORAGE_UNAVAILABLE');
    };
    const result = await new WithdrawalReversalTransport().exchange(r);
    expect(received).toEqual([0x0200]);
    expect(result).toMatchObject({
      outcome: 'APPROVED',
      reversal: { outcome: 'NOT_SENT', transmissionAttempted: false },
    });
  });
  it.each(['WAITING', 'SENDING'])(
    'cancelar durante %s no permite escribir un reverso después',
    async (phase) => {
      const received: number[] = [];
      const abort = new AbortController();
      const port = await listen((peer, body) => {
        received.push(body.readUInt16BE(22));
        peer.write(
          framing.encode(
            withdrawalResponse(new CapturedVisaBalance('WITHDRAWAL').inspect(body)),
            Buffer.alloc(2),
          ),
        );
      });
      const r = { ...request(port), signal: abort.signal };
      r.reversal.persist = async (progress) => {
        if (progress.outcome === phase) abort.abort();
      };
      const result = await new WithdrawalReversalTransport().exchange(r);
      expect(result).toMatchObject({
        outcome: 'APPROVED',
        reversal: { outcome: 'NOT_SENT', transmissionAttempted: false, bytesQueued: 0 },
      });
      expect(received).toEqual([0x0200]);
    },
  );
  it('una solicitud ya cancelada no abre el enlace ni envía retiro', async () => {
    const abort = new AbortController();
    abort.abort();
    const port = await listen(() => {
      throw Error('UNEXPECTED_WRITE');
    });
    const result = await new WithdrawalReversalTransport().exchange({
      ...request(port),
      signal: abort.signal,
    });
    expect(result).toMatchObject({
      transmissionAttempted: false,
      reversal: { outcome: 'NOT_SENT' },
    });
    expect(peers.size).toBe(0);
  });
  it('no abre conexión cuando falta un campo para generar el reverso', async () => {
    let connections = 0;
    const port = await listen(() => {
      connections++;
    });
    const r = request(port);
    r.wire[0] = 0;
    const result = await new WithdrawalReversalTransport().exchange(r);
    expect(connections).toBe(0);
    expect(result.transmissionAttempted).toBe(false);
    expect(result.reversal?.outcome).toBe('NOT_SENT');
  });
  it('Main coordina observación, retiro y reverso; persiste ambos sin repetir al reiniciar', async () => {
    const messages: number[] = [];
    const financialPeers = new Set<Socket>();
    const port = await listen((peer, body) => {
      messages.push(body.readUInt16BE(22));
      financialPeers.add(peer);
      const reply =
        body.readUInt16BE(22) === 0x0200
          ? withdrawalResponse(new CapturedVisaBalance('WITHDRAWAL').inspect(body))
          : reversalResponse(body);
      peer.write(framing.encode(reply, Buffer.alloc(2)));
    });
    directory = await mkdtemp(join(tmpdir(), 'coonecta-reversal-'));
    const path = join(directory, 'executions.json');
    const journal = new FileBalanceJournal(path, 'WITHDRAWAL');
    const f = reversalFixture();
    f.target.endpoint.port = port;
    f.lease.endpoint.port = port;
    const identity = {
      agentId: randomUUID(),
      hostname: 'test',
      user: 'test',
      version: 'test',
      uuid: randomUUID,
      now: () => '2026-10-12T20:00:00.000Z',
    };
    const provider = {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: vi.fn(async () => f.lease),
    };
    const connection = await observe(port);
    const unsupported = new WithdrawalService(
      journal,
      connection.manageTransport(new BalanceTcpTransport('WITHDRAWAL')),
      identity,
      provider,
    );
    expect(
      await unsupported.execute(
        f.request,
        f.target,
        { connect: 1000, response: 1000 },
        async () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(provider.acquire).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
    expect(connection.snapshot().state).toBe('CONNECTED');
    const service = new WithdrawalService(
      journal,
      connection.manageTransport(new WithdrawalReversalTransport()),
      identity,
      provider,
    );
    const execution = service.execute(
      f.request,
      f.target,
      { connect: 1000, response: 1000 },
      async () => true,
    );
    let pending;
    for (let i = 0; i < 100; i++) {
      pending = await service.find(f.request.requestId);
      if (pending.ok && pending.value?.reversal?.outcome === 'WAITING') break;
      await new Promise((done) => setTimeout(done, 10));
    }
    expect(connection.snapshot()).toMatchObject({
      state: 'DISCONNECTED',
      reason: 'TRANSACTION_STARTED',
    });
    const result = await execution;
    await expect.poll(() => connection.snapshot().state).toBe('CONNECTED');
    expect(result).toMatchObject({
      ok: true,
      value: { outcome: 'APPROVED', reversal: { outcome: 'APPROVED' } },
    });
    expect(pending).toMatchObject({
      ok: true,
      value: { outcome: 'APPROVED', finishedAt: null, reversal: { outcome: 'WAITING' } },
    });
    if (!result.ok) throw Error('TEST_SETUP');
    expect(result.value.reversal!.transactionId).not.toBe(result.value.transactionId);
    expect(withdrawalBlocksNewExecution(result.value)).toBe(false);
    const restarted = new WithdrawalService(
      journal,
      connection.manageTransport(new WithdrawalReversalTransport()),
      identity,
      provider,
    );
    expect(
      await restarted.execute(
        f.request,
        f.target,
        { connect: 1000, response: 1000 },
        async () => true,
      ),
    ).toEqual(result);
    expect(messages).toEqual([0x0200, 0x0420]);
    expect(financialPeers.size).toBe(1);
    const saved = await readFile(path, 'utf8');
    expect(saved).not.toMatch(/privateFields|opaqueBody|pinBlock|411111\d{10}/);
    expect(
      result.value.reversal?.messages?.request.fields
        .find((f) => f.number === 55)
        ?.tags?.find((t) => t.tag === '9F10')?.value,
    ).toBe('••••••••');
    expect(saved).toContain('411111XXXXXX0000');
    expect(result.value.reversal?.messages?.response?.mti).toBe('0430');
    expect((await journal.read())[0]?.reversal?.messages).toEqual(result.value.reversal?.messages);
    expect(result.ok && result.value.messages?.response?.mti).toBe('0210');
    const conflict = await restarted.execute(
      { ...f.request, reversalDelaySeconds: 5 },
      f.target,
      { connect: 1000, response: 1000 },
      async () => true,
    );
    expect(conflict.ok).toBe(false);
    const interrupted = {
      ...result.value,
      finishedAt: null,
      reversal: {
        ...result.value.reversal!,
        outcome: 'SENDING' as const,
        finishedAt: null,
        responseCode: null,
        bytesQueued: 0,
      },
    };
    await journal.write([interrupted]);
    expect(
      await restarted.execute(
        f.request,
        f.target,
        { connect: 1000, response: 1000 },
        async () => true,
      ),
    ).toEqual({ ok: true, value: interrupted });
    expect(
      await restarted.execute(
        { ...f.request, requestId: randomUUID() },
        f.target,
        { connect: 1000, response: 1000 },
        async () => true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(messages).toEqual([0x0200, 0x0420]);
    expect(provider.acquire).toHaveBeenCalledOnce();
  });
});
