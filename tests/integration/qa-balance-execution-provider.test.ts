import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QaBalanceExecutionProvider } from '../../apps/desktop/src/main/qa-balance-execution-provider';
import { QaWithdrawalExecutionProvider } from '../../apps/desktop/src/main/qa-withdrawal-execution-provider';
import { FileQaWithdrawalPolicies } from '../../apps/desktop/src/main/infrastructure/qa-withdrawal-policies';
import { WithdrawalService } from '../../apps/desktop/src/main/withdrawal-service';
import { withdrawalResponse } from '../helpers/withdrawal';
import { QaBalanceContextRouter } from '../../apps/desktop/src/main/qa-balance-context-router';
import { FileQaExecutionProfiles } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { BalanceTcpTransport } from '../../apps/desktop/src/main/adapters/balance-tcp-transport';
import { QaSwitchConnection } from '../../apps/desktop/src/main/adapters/qa-switch-connection';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { parseCardTlv } from '../../apps/desktop/src/main/adapters/emv-card-identity';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import { fixtureFields, balanceResponse, balanceRequest } from '../helpers/balance-inquiry';
import {
  fakeCardSession,
  identityResponses,
  success,
  tlv,
  syntheticPan,
} from '../helpers/card-identity';
import {
  qaAcResponse,
  qaCardFields,
  qaExecutionFixture,
  qaNow,
  qaWithdrawalPolicy,
} from '../helpers/qa-execution';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('proveedor PIN/EMV conectado a lectura, ISO y TCP', () => {
  it.each(['BALANCE', 'WITHDRAWAL', 'WITHDRAWAL_BALANCE_PROFILE'] as const)(
    'envia dos operaciones %s sinteticas nuevas y solo persiste correlacion/resultados',
    async (variant) => {
      const operation = variant === 'BALANCE' ? 'BALANCE' : 'WITHDRAWAL';
      const cash = variant === 'WITHDRAWAL';
      const directory = await mkdtemp(join(tmpdir(), 'coonecta-qa-execution-'));
      const { row, input, target } = qaExecutionFixture();
      if (operation === 'WITHDRAWAL')
        target.draft = { ...target.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' };
      const framing = new CapturedVisaFraming(),
        codec = new CapturedVisaBalance(operation);
      const received: { stan: string; atc: string; unpredictable: string }[] = [];
      let serverFailure: unknown;
      const server = createServer((socket) => {
        const decoder = framing.decoder();
        socket.on('data', (chunk) => {
          try {
            for (const frame of decoder.push(chunk)) {
              const metadata = codec.inspect(frame.opaqueBody);
              const fields = fixtureFields(Buffer.from(frame.opaqueBody));
              // Approved frame 218 uses a binary digit count and leading zero nibble,
              // whereas EMV tag 57 uses a trailing F nibble for the same odd length.
              expect(fields.get(35)).toEqual(
                Buffer.concat([
                  Buffer.of(37),
                  Buffer.from('0' + syntheticPan + 'D2912101' + '0'.repeat(13), 'hex'),
                ]),
              );
              const emv = new Map(
                parseCardTlv(fields.get(55)!.subarray(4)).map((node) => [node.tag, node.value]),
              );
              const chipField = fields.get(55)!;
              // SRVPIN defaults to 00 if the Switch omits F23 and F55 lacks 5F34.
              // Carry the actual chip sequence independently in F55.
              expect(emv.get('5F34')).toEqual(Buffer.of(1));
              expect(emv.get('5F34')).toEqual(fields.get(23)!.subarray(-1));
              expect(chipField.subarray(0, 4)).toEqual(
                Buffer.of(chipField.length - 1, 1, 0, chipField.length - 4),
              );
              received.push({
                stan: metadata.stan,
                atc: Buffer.from(emv.get('9F36')!).toString('hex'),
                unpredictable: Buffer.from(emv.get('9F37')!).toString('hex'),
              });
              if (operation === 'WITHDRAWAL') {
                expect(fields.get(4)).toEqual(
                  Buffer.from((received.length === 1 ? '2000' : '5000').padStart(12, '0'), 'hex'),
                );
                expect(emv.get('9F02')).toEqual(cash ? fields.get(4) : Buffer.alloc(6));
                expect(emv.get('9C')).toEqual(Buffer.of(cash ? 1 : 0x30));
                expect(emv.get('9F34')).toEqual(Buffer.from(cash ? '020100' : '020300', 'hex'));
              }
              const response =
                operation === 'WITHDRAWAL'
                  ? withdrawalResponse(metadata)
                  : balanceResponse(metadata);
              const wire = framing.encode(response, Buffer.alloc(2));
              socket.end(wire, () => wire.fill(0));
              response.fill(0);
              frame.opaqueBody.fill(0);
              frame.extension.fill(0);
              for (const value of fields.values()) value.fill(0);
            }
          } catch (error) {
            serverFailure = error;
            socket.destroy();
          }
        });
      });
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      row.endpoint.port = (server.address() as AddressInfo).port;
      target.endpoint.port = row.endpoint.port;
      const path = join(directory, 'profile.json');
      await writeFile(path, JSON.stringify(input));
      const profiles = new FileQaExecutionProfiles(path),
        profile = (await profiles.read()).profiles[0]!;
      const policyPath = join(directory, 'qa-withdrawal-policies.json');
      const policy = qaWithdrawalPolicy(profile);
      policy.allowedAmounts = ['20.00', '50.00'];
      if (variant === 'WITHDRAWAL_BALANCE_PROFILE') {
        policy.validationSource = 'USER_QA_INSTRUCTION';
        policy.transactionType = 'BOUND_PROFILE';
        policy.authorisedAmount = 'ZERO';
      }
      await writeFile(policyPath, JSON.stringify({ version: 1, policies: [policy] }));
      let atc = 0;
      const cards = new CardIdentityService(
        {
          inspect: async () => ({
            checkedAt: qaNow.toISOString(),
            identityStatus: 'NOT_READ',
            readers: [{ name: 'Synthetic Reader', state: 'CARD_PRESENT', atr: null }],
          }),
        },
        async () => {
          const replies = identityResponses();
          const cardFields = qaCardFields();
          if (cash) {
            cardFields.set('9F07', Buffer.from('C200', 'hex'));
            cardFields.set('8E', Buffer.concat([Buffer.alloc(8), Buffer.from('0201', 'hex')]));
          }
          replies[4] = success(tlv('80', Buffer.from([0x10, 0, 0x10, 1, 1, 0])));
          replies[5] = success(
            tlv(
              '70',
              ...[...cardFields]
                .filter(([tag]) => tag !== '82')
                .map(([tag, value]) => tlv(tag, value)),
            ),
          );
          const repeated = replies.map((value) => Buffer.from(value));
          const fake = fakeCardSession([...replies, ...repeated, qaAcResponse(++atc)]);
          fake.session.beginTransaction = async () => {
            fake.state.released = false;
          };
          return fake.session;
        },
      );
      const pins: Buffer[] = [];
      const pinEntry = {
        request: async () => {
          const pin = Buffer.from([49, 50, 51, 52]);
          pins.push(pin);
          return pin;
        },
      };
      const cipher = { available: async () => true, encrypt: async () => Buffer.alloc(8, 0x17) };
      const provider =
        operation === 'WITHDRAWAL'
          ? new QaWithdrawalExecutionProvider(
              profile,
              profiles,
              new FileQaWithdrawalPolicies(policyPath),
              cards,
              pinEntry,
              cipher,
              () => qaNow,
            )
          : new QaBalanceExecutionProvider(profile, profiles, cards, pinEntry, cipher, () => qaNow);
      const router = new QaBalanceContextRouter(operation);
      router.bind({
        atmId: profile.atmId,
        atmRevision: profile.atmRevision,
        terminalId: profile.terminalId,
        endpoint: profile.endpoint,
        provider,
      });
      let records: BalanceExecution[] = [];
      const Service = operation === 'WITHDRAWAL' ? WithdrawalService : BalanceInquiryService;
      const connection = new QaSwitchConnection();
      connection.connect({ environment: 'QA', endpoint: target.endpoint, connectDeadlineMs: 1000 });
      await expect.poll(() => connection.snapshot().state).toBe('CONNECTED');
      const transport = new BalanceTcpTransport(operation);
      const service = new Service(
        {
          read: async () => structuredClone(records),
          write: async (value) => {
            records = structuredClone([...value]);
          },
        },
        {
          exchange: (request) =>
            connection.withTransaction(request.endpoint, () => transport.exchange(request)),
        },
        {
          agentId: randomUUID(),
          hostname: 'synthetic',
          user: 'test',
          version: 'test',
          uuid: randomUUID,
          now: () => qaNow.toISOString(),
        },
        router,
      );
      try {
        for (let index = 0; index < 2; index++) {
          if (operation === 'WITHDRAWAL') target.draft.amount = index === 0 ? '20.00' : '50.00';
          const reading = await cards.read({ readerName: 'Synthetic Reader' });
          expect(reading.ok).toBe(true);
          if (!reading.ok) throw Error('SYNTHETIC_READING_FAILED');
          target.cardReadId = reading.value.readId;
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
              correlation: { stan: String(650101 + index) },
            },
          });
          expect(await cards.current()).toBeNull();
          await expect.poll(() => connection.snapshot().state).toBe('CONNECTED');
        }
        expect(serverFailure).toBeUndefined();
        expect(pins).toHaveLength(2);
        expect(records[0]!.requestId).not.toBe(records[1]!.requestId);
        expect(records[0]!.cardReadId).not.toBe(records[1]!.cardReadId);
        if (operation === 'WITHDRAWAL')
          expect(records.map((record) => record.withdrawal?.amount)).toEqual(['20.00', '50.00']);
        expect(received.map((item) => item.atc)).toEqual(['0001', '0002']);
        expect(received[0]!.unpredictable).not.toBe(received[1]!.unpredictable);
        expect(pins.every((pin) => pin.every((byte) => byte === 0))).toBe(true);
        expect(JSON.stringify(records)).not.toContain(syntheticPan);
        expect(JSON.stringify(records)).not.toContain('privateFields');
        expect(records).toHaveLength(2);
        expect((await profiles.read()).file.profiles[0]!.reservedSequences).toEqual([]);
      } finally {
        connection.disconnect('APP_CLOSED');
        cards.close();
        await new Promise<void>((done) => server.close(() => done()));
        await removeTestDirectory(directory, 'coonecta-qa-execution-');
      }
    },
  );
});
