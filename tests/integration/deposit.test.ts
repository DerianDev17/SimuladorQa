import { randomUUID } from 'node:crypto';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DepositService } from '../../apps/desktop/src/main/deposit-service';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { FileBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import { depositFixture, depositResponse } from '../helpers/deposit';
import { removeTestDirectory } from '../helpers/temporary-directory';

const runtime = {
  agentId: randomUUID(),
  hostname: 'test-station',
  user: 'test-user',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-12T20:00:00.000Z',
};
const framing = new CapturedVisaFraming();
let server: Server | undefined;
let directory: string | undefined;
const peers = new Set<Socket>();
afterEach(async () => {
  for (const peer of peers) peer.destroy();
  peers.clear();
  if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
  if (directory) await removeTestDirectory(directory, 'coonecta-deposit-');
  directory = undefined;
});

describe('depósito: TCP loopback, diario y recuperación', () => {
  it.each([
    { mode: '00', outcome: 'APPROVED', blocked: false },
    { mode: '12', outcome: 'NOT_APPROVED', blocked: false },
    { mode: '59', outcome: 'REQUIRES_REVIEW', blocked: true },
    { mode: 'wrong-amount', outcome: 'REQUIRES_REVIEW', blocked: true },
    { mode: 'wrong-stan', outcome: 'RESPONSE_TIMEOUT', blocked: true },
    { mode: 'timeout', outcome: 'RESPONSE_TIMEOUT', blocked: true },
  ])('conserva %s sin reintentos y tras reinicio', async ({ mode, outcome, blocked }) => {
    let received = 0;
    server = createServer((peer) => {
      peers.add(peer);
      peer.on('error', () => undefined);
      peer.once('close', () => peers.delete(peer));
      const decoder = framing.decoder();
      peer.on('data', (chunk) => {
        for (const frame of decoder.push(chunk)) {
          received++;
          const metadata = new CapturedVisaBalance('DEPOSIT').inspect(frame.opaqueBody);
          expect(metadata).toMatchObject({
            processingCode: '211000',
            amount: '1000'.padStart(12, '0'),
          });
          if (mode !== 'timeout') {
            const body = depositResponse(metadata, /^\d{2}$/.test(mode) ? mode : '00', (fields) => {
              if (mode === 'wrong-amount')
                fields.set(4, Buffer.from('2000'.padStart(12, '0'), 'hex'));
              if (mode === 'wrong-stan') fields.set(11, Buffer.from('999999', 'hex'));
            });
            const wire = framing.encode(body, Buffer.alloc(2));
            peer.write(wire.subarray(0, 9));
            peer.write(wire.subarray(9));
            body.fill(0);
          }
          frame.opaqueBody.fill(0);
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('TEST_SERVER_UNAVAILABLE');
    directory = await mkdtemp(join(tmpdir(), 'coonecta-deposit-'));
    const path = join(directory, 'deposit.json');
    const input = depositFixture();
    input.target.endpoint.port = address.port;
    input.lease.endpoint.port = address.port;
    const acquire = vi.fn(async () => input.lease);
    const context = { inspect: async () => ({ ready: true, blockers: [] }), acquire };
    const transport = new BalanceTcpTransport('DEPOSIT');
    const journal = new FileBalanceJournal(path, 'DEPOSIT');
    const service = new DepositService(journal, transport, runtime, context);
    const deadlines = { connect: 1000, response: 150 };
    const result = await service.execute(input.request, input.target, deadlines, async () => true);
    expect(result).toMatchObject({
      ok: true,
      value: { outcome, deposit: { amount: '10.00' }, transmissionAttempted: true },
    });
    if (!result.ok) throw Error('TEST_SETUP');
    expect(await journal.read()).toEqual([result.value]);
    expect(await readFile(path, 'utf8')).not.toMatch(/\b\d{16,19}\b/);

    // Exercise the production SQLite journal's JSON migration and operation isolation.
    const sqlite = new SqliteBalanceJournal(join(directory, 'deposit.sqlite'), path, 'DEPOSIT');
    try {
      expect(await sqlite.read()).toEqual([result.value]);
      const restarted = new DepositService(sqlite, transport, runtime, context);
      expect(
        await restarted.execute(input.request, input.target, deadlines, async () => true),
      ).toEqual(result);
      expect(received).toBe(1);
      expect(acquire).toHaveBeenCalledTimes(1);
      if (blocked) {
        expect(
          await restarted.execute(
            { ...input.request, requestId: randomUUID() },
            input.target,
            deadlines,
            async () => true,
          ),
        ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
        expect(received).toBe(1);
      }
    } finally {
      await sqlite.close();
    }
  });
});
