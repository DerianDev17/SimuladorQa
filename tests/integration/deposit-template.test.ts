import { randomUUID } from 'node:crypto';
import { createServer, type Socket } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DepositService } from '../../apps/desktop/src/main/deposit-service';
import {
  QaAtmTemplate,
  QaTemplateContextProvider,
} from '../../apps/desktop/src/main/qa-atm-template';
import { FileQaExecutionProfiles } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { parseCardTlv } from '../../apps/desktop/src/main/adapters/emv-card-identity';
import type { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import { qaExecutionFixture, qaCardFields, qaAcResponse, qaNow } from '../helpers/qa-execution';
import { fakeCardSession } from '../helpers/card-identity';
import { templateCatalog } from '../helpers/qa-template';
import { depositResponse } from '../helpers/deposit';
import { balanceRequest, fixtureFields } from '../helpers/balance-inquiry';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('depósito: plantilla, PIN/AC nuevos, TCP local y SQLite', () => {
  it.each(['00', '12', 'MISMATCH', 'TIMEOUT', 'WRONG_RRN', '59'] as const)(
    'conserva resultado %s, correlación e idempotencia tras reiniciar',
    async (mode) => {
      const dir = await mkdtemp(join(tmpdir(), 'coonecta-deposit-'));
      const f = qaExecutionFixture();
      f.target.draft = { ...f.target.draft, transaction: 'DEPOSIT', amount: '10.00' };
      const codec = new CapturedVisaBalance('DEPOSIT');
      const framing = new CapturedVisaFraming();
      const peers = new Set<Socket>();
      let received = 0;
      let serverError: unknown;
      const server = createServer((peer) => {
        peers.add(peer);
        peer.on('error', () => {});
        peer.once('close', () => peers.delete(peer));
        const decoder = framing.decoder();
        peer.on('data', (chunk) => {
          try {
            for (const frame of decoder.push(chunk)) {
              try {
                received++;
                const metadata = codec.inspect(frame.opaqueBody);
                const fields = fixtureFields(frame.opaqueBody);
                expect(metadata).toMatchObject({
                  processingCode: '211000',
                  amount: '1000'.padStart(12, '0'),
                  stan: '650101',
                });
                const tags = new Map(
                  parseCardTlv(fields.get(55)!.subarray(4)).map((t) => [
                    t.tag,
                    Buffer.from(t.value).toString('hex'),
                  ]),
                );
                expect(tags.get('9F02')).toBe('1000'.padStart(12, '0'));
                expect(tags.get('9C')).toBe('30');
                expect(fields.get(52)).toEqual(Buffer.alloc(8, 0x17));
                if (mode === 'TIMEOUT') continue;
                const response = depositResponse(
                  metadata,
                  mode === '12' ? '12' : mode === '59' ? '59' : '00',
                  (values) => {
                    // Synthetic response variant from the original deposit regression suite.
                    values.set(
                      2,
                      Buffer.concat([Buffer.of(19), Buffer.from('0' + '4'.repeat(19), 'hex')]),
                    );
                    values.set(23, Buffer.from('0001', 'hex'));
                    if (mode === 'MISMATCH')
                      values.set(4, Buffer.from('999'.padStart(12, '0'), 'hex'));
                    if (mode === 'WRONG_RRN') values.set(37, Buffer.alloc(12, 0xf9));
                  },
                );
                const wire = framing.encode(response, Buffer.alloc(2));
                peer.write(wire.subarray(0, 9));
                peer.write(wire.subarray(9));
                // Keep wrong-correlation connection open until the client deadline.
              } finally {
                frame.opaqueBody.fill(0);
              }
            }
          } catch (error) {
            serverError = error;
            peer.destroy();
          }
        });
      });
      const journal = new SqliteBalanceJournal(
        join(dir, 'deposits.sqlite'),
        join(dir, 'legacy.json'),
        'DEPOSIT',
      );
      const runtime = {
        agentId: randomUUID(),
        hostname: 'test',
        user: 'test',
        version: 'test',
        uuid: randomUUID,
        now: () => qaNow.toISOString(),
      };
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve();
          });
        });
        const address = server.address();
        if (!address || typeof address === 'string') throw Error('TEST_SERVER');
        f.row.endpoint.port = f.target.endpoint.port = address.port;
        const path = join(dir, 'profiles.json');
        await writeFile(path, JSON.stringify(f.input));
        const profiles = new FileQaExecutionProfiles(path);
        const catalog = templateCatalog(f.target);
        const template = new QaAtmTemplate(profiles, async () => catalog, { read: async () => [] });
        const pin = Buffer.from([49, 50, 51, 52]);
        const pinEntry = { request: vi.fn(async () => pin) };
        const cipher = {
          available: async () => true,
          encrypt: vi.fn(async () => Buffer.alloc(8, 0x17)),
        };
        const card = fakeCardSession([qaAcResponse()]);
        const cards: Pick<CardIdentityService, 'current' | 'withTransaction'> = {
          current: async () =>
            ({
              status: 'READ',
              readId: f.target.cardReadId,
              applicationId: f.profile.applicationId,
            }) as Awaited<ReturnType<CardIdentityService['current']>>,
          withTransaction: async (_readId, _signal, action) => action(card.session, qaCardFields()),
        };
        const context = new QaTemplateContextProvider(
          template,
          'DEPOSIT',
          cards,
          pinEntry,
          cipher,
          () => qaNow,
        );
        const transport = new BalanceTcpTransport('DEPOSIT');
        const service = new DepositService(journal, transport, runtime, context);
        const request = balanceRequest(f.target);
        const result = await service.execute(
          request,
          f.target,
          { connect: 1000, response: 150 },
          async () => true,
        );
        expect(serverError).toBeUndefined();
        expect(result).toMatchObject({
          ok: true,
          value: {
            deposit: { amount: '10.00' },
            outcome:
              mode === '00'
                ? 'APPROVED'
                : mode === '12'
                  ? 'NOT_APPROVED'
                  : mode === 'TIMEOUT' || mode === 'WRONG_RRN'
                    ? 'RESPONSE_TIMEOUT'
                    : 'REQUIRES_REVIEW',
          },
        });
        expect(received).toBe(1);
        expect(pin.every((byte) => byte === 0)).toBe(true);
        expect(pinEntry.request).toHaveBeenCalledTimes(1);
        expect(cipher.encrypt).toHaveBeenCalledTimes(1);
        expect((await profiles.read()).file.profiles[0]!.reservedSequences).toEqual([650102]);
        await journal.close();
        const reopened = new SqliteBalanceJournal(
          join(dir, 'deposits.sqlite'),
          join(dir, 'legacy.json'),
          'DEPOSIT',
        );
        try {
          const restarted = new DepositService(reopened, transport, runtime, context);
          expect(
            await restarted.execute(
              request,
              f.target,
              { connect: 1000, response: 150 },
              async () => true,
            ),
          ).toEqual(result);
          expect(received).toBe(1);
          expect(pinEntry.request).toHaveBeenCalledTimes(1);
          expect(cipher.encrypt).toHaveBeenCalledTimes(1);
          expect((await profiles.read()).file.profiles[0]!.reservedSequences).toEqual([650102]);
          const saved = (await reopened.read())[0]!;
          expect(saved.messages?.request.fields.find((field) => field.number === 3)?.value).toBe(
            '211000',
          );
          expect(saved.withdrawal).toBeUndefined();
          if (mode === 'TIMEOUT' || mode === 'WRONG_RRN')
            expect(saved.messages?.response).toBeUndefined();
          else {
            expect(
              saved.messages?.response?.fields.find((field) => field.number === 23)?.value,
            ).toBe('001');
            expect(JSON.stringify(saved)).not.toContain('4'.repeat(19));
          }
          if (!['00', '12'].includes(mode)) {
            expect(
              await restarted.execute(
                { ...request, requestId: randomUUID() },
                f.target,
                { connect: 1000, response: 150 },
                async () => true,
              ),
            ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
            expect(pinEntry.request).toHaveBeenCalledTimes(1);
            expect(received).toBe(1);
            expect((await profiles.read()).file.profiles[0]!.reservedSequences).toEqual([650102]);
          }
        } finally {
          await reopened.close();
        }
      } finally {
        await journal.close();
        for (const peer of peers) peer.destroy();
        if (server.listening) await new Promise<void>((done) => server.close(() => done()));
        await removeTestDirectory(dir, 'coonecta-deposit-');
      }
    },
  );
});
