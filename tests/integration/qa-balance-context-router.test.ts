import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { QaBalanceContextRouter } from '../../apps/desktop/src/main/qa-balance-context-router';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import {
  balanceLease,
  balanceTarget,
  balanceRequest,
  balanceResponse,
} from '../helpers/balance-inquiry';

describe('dos perfiles ATM por el proveedor integrado y TCP local', () => {
  it('genera dos consultas nuevas sinteticas, sin lector, y correlaciona cada ATM', async () => {
    const framing = new CapturedVisaFraming();
    const codec = new CapturedVisaBalance();
    const received: { stan: string; terminalId: string }[] = [];
    const server = createServer((socket) => {
      const decoder = framing.decoder();
      socket.on('data', (chunk) => {
        for (const frame of decoder.push(chunk)) {
          try {
            const metadata = codec.inspect(frame.opaqueBody);
            received.push({ stan: metadata.stan, terminalId: metadata.terminalId });
            const response = balanceResponse(metadata, '00', (fields) => {
              const terminal = Buffer.from(fields.get(41)!);
              terminal[terminal.length - 1] = 0xf0 + Number(metadata.terminalId.at(-1));
              fields.set(41, terminal);
            });
            const wire = framing.encode(response, Buffer.alloc(2));
            socket.end(wire, () => wire.fill(0));
            response.fill(0);
          } finally {
            frame.opaqueBody.fill(0);
            frame.extension.fill(0);
          }
        }
        chunk.fill(0);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const router = new QaBalanceContextRouter();
      const first = balanceTarget();
      const second = balanceTarget();
      first.endpoint.port = (server.address() as AddressInfo).port;
      second.endpoint = { ...first.endpoint };
      second.terminalId = 'ATM20522';
      for (const [index, target] of [first, second].entries()) {
        router.bind({
          atmId: target.draft.atmId!,
          atmRevision: target.draft.atmRevision!,
          terminalId: target.terminalId,
          endpoint: target.endpoint,
          provider: {
            inspect: async () => ({ ready: true, blockers: [] }),
            acquire: async (actualTarget) => ({
              ...balanceLease(actualTarget),
              sequence: 650101 + index,
            }),
          },
        });
      }
      let records: BalanceExecution[] = [];
      const service = new BalanceInquiryService(
        {
          read: async () => structuredClone(records),
          write: async (input) => {
            records = structuredClone([...input]);
          },
        },
        new BalanceTcpTransport(),
        {
          agentId: randomUUID(),
          hostname: 'synthetic-test',
          user: 'test',
          version: 'test',
          uuid: randomUUID,
          now: () => '2026-10-12T20:00:00.000Z',
        },
        router,
      );
      for (const target of [first, second]) {
        expect((await service.inspect(target)).ready).toBe(true);
        const result = await service.execute(
          balanceRequest(target),
          target,
          { connect: 1000, response: 1000 },
          async () => true,
        );
        expect(result).toMatchObject({
          ok: true,
          value: {
            outcome: 'APPROVED',
            transmissionAttempted: true,
            correlation: { terminalId: target.terminalId },
          },
        });
      }
      expect(received).toEqual([
        { stan: '650101', terminalId: 'ATM20521' },
        { stan: '650102', terminalId: 'ATM20522' },
      ]);
      expect(records).toHaveLength(2);
      expect(new Set(records.map((record) => record.transactionId)).size).toBe(2);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
