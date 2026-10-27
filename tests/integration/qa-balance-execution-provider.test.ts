import { randomUUID } from 'node:crypto';
import { createServer, type AddressInfo } from 'node:net';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QaBalanceExecutionProvider } from '../../apps/desktop/src/main/qa-balance-execution-provider';
import { QaWithdrawalExecutionProvider } from '../../apps/desktop/src/main/qa-withdrawal-execution-provider';
import {
  QaAtmTemplate,
  QaTemplateContextProvider,
} from '../../apps/desktop/src/main/qa-atm-template';
import { templateCatalog, templateAtm } from '../helpers/qa-template';
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
  it.each([
    'BALANCE',
    'WITHDRAWAL',
    'WITHDRAWAL_BALANCE_PROFILE',
    'BALANCE_TEMPLATE',
    'WITHDRAWAL_TEMPLATE',
    'WITHDRAWAL_BALANCE_PROFILE_TEMPLATE',
    'WITHDRAWAL_CUSTOM_AMOUNT',
    'WITHDRAWAL_BALANCE_PROFILE_CUSTOM_AMOUNT_TEMPLATE',
  ] as const)(
    'envía operaciones %s nuevas, reutiliza perfiles y solo persiste correlación/resultados',
    async (variant) => {
      const inherited = variant.endsWith('_TEMPLATE');
      const mode = variant.replace(/_TEMPLATE$/, '').replace('_CUSTOM_AMOUNT', '');
      const customAmount = variant.includes('_CUSTOM_AMOUNT');
      const amounts = customAmount ? ['75.25', '1234.56'] : ['20.00', '50.00'];
      const amountAt = (index: number) => amounts[index === 0 ? 0 : 1]!;
      const operation = mode === 'BALANCE' ? 'BALANCE' : 'WITHDRAWAL';
      const cash = mode === 'WITHDRAWAL';
      const directory = await mkdtemp(join(tmpdir(), 'coonecta-qa-execution-'));
      const { row, input, target } = qaExecutionFixture();
      const other = qaExecutionFixture();
      other.row.terminalId = other.target.terminalId = 'ATM20524';
      other.row.keyReference = row.keyReference;
      other.row.reservedSequences = [650103];
      if (inherited) row.reservedSequences.push(650103);
      if (operation === 'WITHDRAWAL')
        target.draft = { ...target.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' };
      if (inherited && operation === 'WITHDRAWAL')
        other.target.draft = {
          ...other.target.draft,
          transaction: 'WITHDRAWAL_APPROVED',
          amount: '50.00',
        };
      const catalog = templateCatalog(target);
      const framing = new CapturedVisaFraming(),
        codec = new CapturedVisaBalance(operation);
      const received: { stan: string; terminalId: string; atc: string; unpredictable: string }[] =
        [];
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
                terminalId: metadata.terminalId,
                atc: Buffer.from(emv.get('9F36')!).toString('hex'),
                unpredictable: Buffer.from(emv.get('9F37')!).toString('hex'),
              });
              if (operation === 'WITHDRAWAL') {
                expect(fields.get(4)).toEqual(
                  Buffer.from(
                    amountAt(received.length - 1)
                      .replace('.', '')
                      .padStart(12, '0'),
                    'hex',
                  ),
                );
                expect(emv.get('9F02')).toEqual(cash ? fields.get(4) : Buffer.alloc(6));
                expect(emv.get('9C')).toEqual(Buffer.of(cash ? 1 : 0x30));
                expect(emv.get('9F34')).toEqual(Buffer.from(cash ? '020100' : '020300', 'hex'));
              }
              const response =
                operation === 'WITHDRAWAL'
                  ? withdrawalResponse(metadata, '00', (responseFields) => {
                      responseFields.set(41, Buffer.from(fields.get(41)!));
                    })
                  : balanceResponse(metadata, '00', (responseFields) => {
                      responseFields.set(41, Buffer.from(fields.get(41)!));
                    });
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
      if (operation === 'BALANCE' || inherited) {
        other.row.endpoint.port = other.target.endpoint.port = row.endpoint.port;
        if (!inherited) input.profiles.push(other.row);
      }
      const path = join(directory, 'profile.json');
      await writeFile(path, JSON.stringify(input));
      const profiles = new FileQaExecutionProfiles(path),
        profile = (await profiles.read()).profiles[0]!;
      const policyPath = join(directory, 'qa-withdrawal-policies.json');
      const policy = qaWithdrawalPolicy(profile);
      policy.allowedAmounts = customAmount ? 'ANY_POSITIVE_AMOUNT' : amounts;
      if (mode === 'WITHDRAWAL_BALANCE_PROFILE') {
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
      const encryptedWith: string[] = [];
      const cipher = {
        available: async (reference: string) => reference === row.keyReference,
        encrypt: async (_block: Uint8Array, reference: string) => {
          encryptedWith.push(reference);
          return Buffer.alloc(8, 0x17);
        },
      };
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
      const router = inherited
        ? new QaTemplateContextProvider(
            new QaAtmTemplate(
              profiles,
              async () => structuredClone(catalog),
              new FileQaWithdrawalPolicies(policyPath),
            ),
            operation,
            cards,
            pinEntry,
            cipher,
            () => qaNow,
          )
        : new QaBalanceContextRouter(operation);
      if (router instanceof QaBalanceContextRouter) {
        router.bind({
          atmId: profile.atmId,
          atmRevision: profile.atmRevision,
          terminalId: profile.terminalId,
          endpoint: profile.endpoint,
          provider,
        });
        if (operation === 'BALANCE') {
          const secondProfile = (await profiles.read()).profiles[1]!;
          router.bind({
            atmId: secondProfile.atmId,
            atmRevision: secondProfile.atmRevision,
            terminalId: secondProfile.terminalId,
            endpoint: secondProfile.endpoint,
            provider: new QaBalanceExecutionProvider(
              secondProfile,
              profiles,
              cards,
              pinEntry,
              cipher,
              () => qaNow,
            ),
          });
        }
      }
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
        connection.manageTransport(transport),
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
        const targets =
          operation === 'BALANCE' || inherited ? [target, other.target, target] : [target, target];
        const sequences = inherited
          ? ['650101', '650102', '650103']
          : operation === 'BALANCE'
            ? ['650101', '650103', '650102']
            : ['650101', '650102'];
        for (const [index, currentTarget] of targets.entries()) {
          if (inherited && index === 1)
            catalog.atms.push(templateAtm(other.target, catalog.entities[0]!.id));
          if (operation === 'WITHDRAWAL') currentTarget.draft.amount = amountAt(index);
          const reading = await cards.read({ readerName: 'Synthetic Reader' });
          expect(reading.ok).toBe(true);
          if (!reading.ok) throw Error('SYNTHETIC_READING_FAILED');
          currentTarget.cardReadId = reading.value.readId;
          expect((await service.inspect(currentTarget)).ready).toBe(true);
          const result = await service.execute(
            balanceRequest(currentTarget),
            currentTarget,
            { connect: 1000, response: 1000 },
            async () => true,
          );
          expect(serverFailure).toBeUndefined();
          expect(result).toMatchObject({
            ok: true,
            value: {
              outcome: 'APPROVED',
              transmissionAttempted: true,
              correlation: { stan: sequences[index], terminalId: currentTarget.terminalId },
            },
          });
          expect(await cards.current()).toBeNull();
          await expect.poll(() => connection.snapshot().state).toBe('CONNECTED');
        }
        expect(serverFailure).toBeUndefined();
        expect(pins).toHaveLength(targets.length);
        expect(encryptedWith).toEqual(targets.map(() => row.keyReference));
        expect(records[0]!.requestId).not.toBe(records[1]!.requestId);
        expect(records[0]!.cardReadId).not.toBe(records[1]!.cardReadId);
        if (operation === 'WITHDRAWAL')
          expect(records.map((record) => record.withdrawal?.amount)).toEqual(
            targets.map((_, index) => amountAt(index)),
          );
        expect(received.map((item) => item.atc)).toEqual(
          targets.map((_, index) => String(index + 1).padStart(4, '0')),
        );
        expect(received.map((item) => item.terminalId)).toEqual(targets.map((t) => t.terminalId));
        expect(new Set(records.map((record) => record.requestId)).size).toBe(targets.length);
        expect(received[0]!.unpredictable).not.toBe(received[1]!.unpredictable);
        expect(pins.every((pin) => pin.every((byte) => byte === 0))).toBe(true);
        expect(JSON.stringify(records)).not.toContain(syntheticPan);
        expect(JSON.stringify(records)).not.toContain('privateFields');
        expect(records).toHaveLength(targets.length);
        if (inherited) expect((await profiles.read()).profiles).toHaveLength(1);
        expect(
          (await profiles.read()).file.profiles.every(
            (p) => (p.reservedSequences as number[]).length === 0,
          ),
        ).toBe(true);
      } finally {
        connection.disconnect('APP_CLOSED');
        cards.close();
        await new Promise<void>((done) => server.close(() => done()));
        await removeTestDirectory(directory, 'coonecta-qa-execution-');
      }
    },
  );
});
