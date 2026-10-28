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

it.each(['APPROVED', 'TIMEOUT', 'STOP'] as const)(
  'una corrida con dos ATM alterna por TCP, persiste y respeta %s sin repetir envíos',
  async (mode) => {
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
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => sockets.delete(socket));
      const decoder = wire.decoder();
      socket.on('data', (chunk) => {
        for (const frame of decoder.push(chunk)) {
          const fields = fixtureFields(Buffer.from(frame.opaqueBody));
          const metadata = codec.inspect(frame.opaqueBody);
          received.push({ terminalId: metadata.terminalId, stan: metadata.stan });
          if (mode === 'APPROVED' || received.length === 1)
            socket.end(
              wire.encode(
                balanceResponse(metadata, '00', (response) => response.set(41, fields.get(41)!)),
                Buffer.alloc(2),
              ),
            );
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
    const financial = new BalanceInquiryService(journal, new BalanceTcpTransport(), runtime, {
      inspect: async () => ({ ready: true, blockers: [], sequencesRemaining: 3 }),
      acquire: async (target, signal) => {
        const pin = await pins.request(signal);
        if (!pin) throw Error('PIN_CANCELLED');
        pin.fill(0);
        return { ...balanceLease(target), sequence: ++sequence };
      },
    });
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
            { connect: 1000, response: mode === 'STOP' ? 5000 : 200 },
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
        read: async () => ({ ok: true, value: { ...original, readId: randomUUID() } }),
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
        concurrency: 1,
        maxTransactions: 3,
        durationSeconds: 10,
        rampUpSeconds: 0,
      },
    };
    try {
      const started = await service.start(request);
      if (!started.ok) throw Error(started.error.message);
      if (mode === 'STOP') {
        await vi.waitFor(() => expect(received).toHaveLength(2));
        service.stop({ runId: started.value.runId });
      }
      await service.whenIdle();
      const run = await store.read();
      // Stopping after a write preserves delivery uncertainty, as does timeout.
      expect(run?.state).toBe(mode === 'APPROVED' ? 'COMPLETED' : 'FAILED');
      const terminals =
        mode === 'APPROVED' ? ['ATM20521', 'ATM20524', 'ATM20521'] : ['ATM20521', 'ATM20524'];
      expect(received.map((item) => item.terminalId)).toEqual(terminals);
      expect(run?.items.map((item) => item.atmId)).toEqual(
        terminals.map((id) => targets.find((atm) => atm.terminalId === id)!.draft.atmId),
      );
      expect(new Set(received.map((item) => item.stan)).size).toBe(terminals.length);
      expect(new Set(reads).size).toBe(terminals.length);
      expect(maxActive).toBe(1);
      expect(ask).toHaveBeenCalledOnce();
      const financialRecords = await journal.read();
      expect(financialRecords.every((item) => item.runId === run!.runId)).toBe(true);
      expect(financialRecords).toHaveLength(terminals.length);
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
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await removeTestDirectory(directory, 'coonecta-multi-load-');
    }
  },
);
