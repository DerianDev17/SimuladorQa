import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo, type Socket } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { expect, it, vi } from 'vitest';
import { PhysicalCardLoadDriver } from '../../apps/desktop/src/main/physical-card-load-driver';
import { LoadRunService } from '../../apps/desktop/src/main/load-run-service';
import { LoadPinSession } from '../../apps/desktop/src/main/adapters/load-pin-session';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { QaSwitchConnection } from '../../apps/desktop/src/main/adapters/qa-switch-connection';
import type { BalanceExchangeRequest } from '../../apps/desktop/src/main/balance-ports';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import { SqliteLoadRunStore } from '../../apps/desktop/src/main/infrastructure/sqlite-load-run-store';
import { workerLoadScheduler } from '../../apps/desktop/src/main/infrastructure/load-scheduler';
import type { DesktopApplication } from '../../apps/desktop/src/main/application';
import {
  parseBalanceContextRequest,
  parseBalanceExecutionRequest,
} from '../../packages/domain/src/balance-inquiry';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import type { LoadRunRequest } from '../../packages/domain/src/load-run';
import {
  balanceTarget,
  balanceLease,
  balanceResponse,
  fixtureFields,
} from '../helpers/balance-inquiry';
import { removeTestDirectory } from '../helpers/temporary-directory';

it.each([
  'APPROVED',
  'TIMEOUT',
  'STOP',
  'CONCURRENT',
  'CONCURRENT_FIVE',
  'CONCURRENT_TIMEOUT',
  'CONCURRENT_STOP',
] as const)(
  'una corrida con dos ATM alterna por TCP, persiste y respeta %s sin repetir envíos',
  async (mode) => {
    const concurrent = mode.startsWith('CONCURRENT');
    const approved = mode === 'APPROVED' || mode === 'CONCURRENT' || mode === 'CONCURRENT_FIVE';
    const operationCount = mode === 'CONCURRENT_FIVE' ? 7 : 3;
    const stopping = mode === 'STOP' || mode === 'CONCURRENT_STOP';
    const directory = await mkdtemp(join(tmpdir(), 'coonecta-multi-load-'));
    const worker = join(directory, 'worker.cjs');
    await build({
      entryPoints: ['apps/desktop/src/main/infrastructure/load-worker.ts'],
      outfile: worker,
      bundle: true,
      platform: 'node',
      format: 'cjs',
    });
    const wire = new CapturedVisaFraming();
    const codec = new CapturedVisaBalance();
    const received: { terminalId: string; stan: string }[] = [];
    const sockets = new Set<Socket>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const pendingSockets = new Set<Socket>();
    let peakSockets = 0;
    const writeTimes: number[] = [];
    const responseOrder: string[] = [];
    let activePeer: Socket | undefined;
    let replacements = 0;
    const server = createServer((socket) => {
      // Reproduce TCPComms PID 80131: a new connection replaces the old one.
      if (activePeer && !activePeer.destroyed) {
        replacements++;
        activePeer.destroy();
      }
      activePeer = socket;
      socket.once('end', () => {
        if (activePeer === socket) activePeer = undefined;
      });
      sockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => {
        sockets.delete(socket);
        pendingSockets.delete(socket);
      });
      const decoder = wire.decoder();
      socket.on('data', (chunk) => {
        for (const frame of decoder.push(chunk)) {
          const fields = fixtureFields(Buffer.from(frame.opaqueBody));
          const metadata = codec.inspect(frame.opaqueBody);
          received.push({ terminalId: metadata.terminalId, stan: metadata.stan });
          pendingSockets.add(socket);
          peakSockets = Math.max(peakSockets, pendingSockets.size);
          if (approved || (!concurrent && received.length === 1)) {
            const reply = wire.encode(
              balanceResponse(metadata, '00', (response) => response.set(41, fields.get(41)!)),
              Buffer.alloc(2),
            );
            const respond = () => {
              responseOrder.push(metadata.stan);
              pendingSockets.delete(socket);
              socket.end(reply);
            };
            if (concurrent)
              timers.add(
                setTimeout(
                  respond,
                  received.length === 1 ? (mode === 'CONCURRENT_FIVE' ? 1500 : 800) : 100,
                ),
              );
            else respond();
          }
          frame.opaqueBody.fill(0);
          for (const value of fields.values()) value.fill(0);
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const first = balanceTarget(),
      second = balanceTarget();
    first.endpoint.port = (server.address() as AddressInfo).port;
    second.endpoint = { ...first.endpoint };
    second.terminalId = 'ATM20524';
    const targets = [first, second];
    const runtime = {
      agentId: randomUUID(),
      hostname: 'synthetic',
      user: 'test',
      version: 'test',
      uuid: randomUUID,
      now: () => '2026-10-12T20:00:00.000Z',
    };
    const ask = vi.fn(async () => Uint8Array.of(1, 2, 3, 4));
    const pins = new LoadPinSession({ request: ask });
    const journal = new SqliteBalanceJournal(
      join(directory, 'balance.sqlite'),
      join(directory, 'balance.json'),
    );
    const store = new SqliteLoadRunStore(
      join(directory, 'runs.sqlite'),
      join(directory, 'runs.json'),
    );
    let sequence = 650100;
    let chipActive = 0,
      peakChip = 0;
    const tcp = new BalanceTcpTransport();
    const measuredTransport = {
      exchange: (input: BalanceExchangeRequest) =>
        tcp.exchange({
          ...input,
          withWrite: async (write) => {
            const measuredWrite = () => {
              writeTimes.push(performance.now());
              write();
            };
            if (input.withWrite) await input.withWrite(measuredWrite);
            else measuredWrite();
          },
        }),
    };
    const financial = new BalanceInquiryService(
      journal,
      new QaSwitchConnection().manageTransport(measuredTransport),
      runtime,
      {
        inspect: async () => ({ ready: true, blockers: [], sequencesRemaining: operationCount }),
        acquire: async (target, signal) => {
          peakChip = Math.max(peakChip, ++chipActive);
          try {
            await new Promise((resolve) => setTimeout(resolve, 20));
            const pin = await pins.request(signal);
            if (!pin) throw Error('PIN_CANCELLED');
            pin.fill(0);
            return { ...balanceLease(target), sequence: ++sequence };
          } finally {
            chipActive--;
          }
        },
      },
    );
    let active = 0,
      maxActive = 0;
    const reads: string[] = [];
    const application: Pick<
      DesktopApplication,
      'getSendConfiguration' | 'getBalanceReadiness' | 'executeBalance'
    > = {
      getSendConfiguration: async () => ({
        ok: true,
        value: {
          environment: 'QA',
          status: 'CONFIGURED_BLOCKED',
          documentedEndpoint: null,
          pending: [],
          configuration: {
            id: randomUUID(),
            environment: 'QA',
            revision: 1,
            updatedAt: runtime.now(),
            evidenceId: randomUUID(),
            trigger: 'ON_CLICK',
            endpoint: first.endpoint,
            connectDeadlineMs: 1000,
            observationWindowMs: 200,
          },
        },
      }),
      getBalanceReadiness: async (value) => {
        const context = parseBalanceContextRequest(value)!;
        const target = targets.find((atm) => atm.draft.atmId === context.draft.atmId)!;
        return { ok: true, value: await financial.inspect({ ...target, ...context }) };
      },
      executeBalance: async (value, _operation, execution) => {
        const request = parseBalanceExecutionRequest(value)!;
        const target = targets.find((atm) => atm.draft.atmId === request.draft.atmId)!;
        reads.push(request.cardReadId);
        maxActive = Math.max(maxActive, ++active);
        try {
          return await financial.execute(
            request,
            { ...target, draft: request.draft, cardReadId: request.cardReadId },
            {
              connect: 1000,
              response: stopping ? 5000 : concurrent ? (approved ? 2000 : 500) : 200,
            },
            async () => true,
            execution,
          );
        } finally {
          active--;
        }
      },
    };
    const original: CardIdentityReading = {
      readId: randomUUID(),
      readAt: runtime.now(),
      readerName: 'Synthetic reader',
      status: 'READ',
      applications: [],
      applicationId: 'A1B2C3D4E5F6',
      applicationLabel: 'TEST',
      panMasked: '************2267',
      cardholderName: null,
      expiry: null,
    };
    const driver = new PhysicalCardLoadDriver(
      {
        current: async () => original,
        read: async () => {
          expect(chipActive).toBe(0);
          return { ok: true, value: { ...original, readId: randomUUID() } };
        },
      },
      application,
      pins,
      journal,
      runtime,
      () => {},
    );
    const service = new LoadRunService(runtime, driver, store, workerLoadScheduler(worker));
    const request: LoadRunRequest = {
      requestId: randomUUID(),
      cardReadId: original.readId,
      draft: {
        environment: 'QA',
        operation: 'BALANCE',
        mode: 'LOAD',
        atmId: first.draft.atmId!,
        atmRevision: 1,
        additionalAtms: [{ atmId: second.draft.atmId!, atmRevision: 1 }],
        targetTps: 5,
        concurrency: mode === 'CONCURRENT_FIVE' ? 5 : concurrent ? 2 : 1,
        maxTransactions: operationCount,
        durationSeconds: 10,
        rampUpSeconds: 0,
      },
    };
    try {
      const started = await service.start(request);
      if (!started.ok) throw Error(started.error.message);
      if (stopping) {
        await vi.waitFor(() => expect(received).toHaveLength(concurrent ? 1 : 2));
        if (concurrent) await vi.waitFor(async () => expect(await journal.read()).toHaveLength(2));
        service.stop({ runId: started.value.runId });
      }
      await service.whenIdle();
      const run = await store.read();
      // Stopping after a write preserves delivery uncertainty, as does timeout.
      expect(run?.state).toBe(approved ? 'COMPLETED' : 'FAILED');
      const terminals = Array.from({ length: approved ? operationCount : 2 }, (_, index) =>
        index % 2 ? 'ATM20524' : 'ATM20521',
      );
      const sentTerminals = concurrent && !approved ? terminals.slice(0, 1) : terminals;
      expect(received.map((item) => item.terminalId)).toEqual(sentTerminals);
      expect(run?.items.map((item) => item.atmId).sort()).toEqual(
        terminals.map((id) => targets.find((atm) => atm.terminalId === id)!.draft.atmId).sort(),
      );
      expect(
        run?.items.every(
          (item) =>
            targets.find((atm) => atm.draft.atmId === item.atmId)?.terminalId ===
            item.correlation?.terminalId,
        ),
      ).toBe(true);
      expect(new Set(received.map((item) => item.stan)).size).toBe(sentTerminals.length);
      expect(new Set(reads).size).toBe(terminals.length);
      expect(maxActive).toBe(request.draft.concurrency);
      expect(peakChip).toBe(1);
      expect(peakSockets).toBe(1);
      expect(replacements).toBe(0);
      // Receive callbacks may be delayed/batched by Windows. Verify the sender's
      // actual write boundary, rather than mistaking receive cadence for TPS.
      for (let i = 1; i < writeTimes.length; i++)
        expect(writeTimes[i]! - writeTimes[i - 1]!).toBeGreaterThanOrEqual(195);
      if (concurrent && approved) {
        expect(responseOrder).toEqual(received.map((item) => item.stan));
        expect(run?.items.some((item) => (item.timings?.connectionWaitMs ?? 0) > 100)).toBe(true);
      }
      expect(ask).toHaveBeenCalledOnce();
      const financialRecords = await journal.read();
      expect(financialRecords.every((item) => item.runId === run!.runId)).toBe(true);
      expect(financialRecords).toHaveLength(terminals.length);
      expect(
        financialRecords.every((item) => item.finishedAt !== null && item.outcome !== 'PENDING'),
      ).toBe(true);
      expect(new Set(financialRecords.map((item) => item.transactionId)).size).toBe(
        terminals.length,
      );
      expect(await service.start(request)).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT' },
      });
      await store.close();
      const reopened = new SqliteLoadRunStore(
        join(directory, 'runs.sqlite'),
        join(directory, 'runs.json'),
      );
      try {
        expect(await reopened.read()).toEqual(run);
      } finally {
        await reopened.close();
      }
    } finally {
      service.close();
      await service.whenIdle();
      pins.end();
      await store.close();
      await journal.close();
      for (const timer of timers) clearTimeout(timer);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await removeTestDirectory(directory, 'coonecta-multi-load-');
    }
  },
);
