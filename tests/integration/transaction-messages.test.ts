import { randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import {
  balanceTarget,
  balanceRequest,
  balanceLease,
  balanceResponse,
} from '../helpers/balance-inquiry';
import { withdrawalResponse } from '../helpers/withdrawal';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('mensajería real por TCP local, servicio y persistencia', () => {
  it.each(['APPROVED', 'NOT_APPROVED', 'RESPONSE_TIMEOUT', 'UNRELATED', 'WITHDRAWAL'] as const)(
    'conserva solicitud y solo respuesta correlacionada: %s',
    async (mode) => {
      const directory = await mkdtemp(join(tmpdir(), 'coonecta-messages-'));
      const operation = mode === 'WITHDRAWAL' ? 'WITHDRAWAL' : 'BALANCE';
      const codec = new CapturedVisaBalance(operation);
      const framing = new CapturedVisaFraming();
      const peers = new Set<Socket>();
      let sentRequest: ReturnType<typeof codec.message> | undefined;
      let sentResponse: ReturnType<typeof codec.message> | undefined;
      const server = createServer((peer) => {
        peers.add(peer);
        peer.on('error', () => undefined);
        const decoder = framing.decoder();
        peer.on('data', (chunk) => {
          for (const frame of decoder.push(chunk)) {
            sentRequest = codec.message(frame.opaqueBody);
            const metadata = codec.inspect(frame.opaqueBody);
            if (mode !== 'RESPONSE_TIMEOUT') {
              if (mode === 'UNRELATED') metadata.stan = '999999';
              const body =
                mode === 'WITHDRAWAL'
                  ? withdrawalResponse(metadata)
                  : balanceResponse(metadata, mode === 'NOT_APPROVED' ? '96' : '00');
              sentResponse = codec.message(body);
              peer.write(framing.encode(body, Buffer.alloc(2)));
              body.fill(0);
            }
            frame.opaqueBody.fill(0);
          }
        });
      });
      const path = join(directory, 'journal.sqlite');
      const legacy = join(directory, 'legacy.json');
      let journal = new SqliteBalanceJournal(path, legacy, operation);
      try {
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw Error('TEST_PORT');
        const target = balanceTarget();
        target.endpoint.port = address.port;
        if (mode === 'WITHDRAWAL')
          target.draft = { ...target.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' };
        const request = balanceRequest(target);
        const service = new BalanceInquiryService(
          journal,
          new BalanceTcpTransport(operation),
          {
            agentId: randomUUID(),
            hostname: 'synthetic',
            user: 'synthetic',
            version: 'test',
            uuid: randomUUID,
            now: () => '2026-10-12T20:00:00.000Z',
          },
          {
            inspect: async () => ({ ready: true, blockers: [] }),
            acquire: async (current) => ({
              ...balanceLease(current),
              ...(mode === 'WITHDRAWAL' ? { amount: '20.00' } : {}),
            }),
          },
          5000,
          operation,
        );
        const result = await service.execute(
          request,
          target,
          { connect: 1000, response: 150 },
          async () => true,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) throw Error('TEST_EXECUTION');
        expect(result.value.outcome).toBe(
          mode === 'UNRELATED' ? 'RESPONSE_TIMEOUT' : mode === 'WITHDRAWAL' ? 'APPROVED' : mode,
        );
        expect(result.value.messages?.request).toEqual(sentRequest);
        expect(result.value.messages?.response).toEqual(
          ['RESPONSE_TIMEOUT', 'UNRELATED'].includes(mode) ? undefined : sentResponse,
        );
        expect(JSON.stringify(result.value)).not.toContain('411111' + '11110000');
        await journal.close();
        journal = new SqliteBalanceJournal(path, legacy, operation);
        expect((await journal.read())[0]?.messages).toEqual(result.value.messages);
      } finally {
        for (const peer of peers) peer.destroy();
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await journal.close();
        await removeTestDirectory(directory, 'coonecta-messages-');
      }
    },
  );
});
