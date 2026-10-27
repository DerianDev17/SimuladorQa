import { describe, expect, it, vi } from 'vitest';
import { QaWithdrawalExecutionProvider } from '../../apps/desktop/src/main/qa-withdrawal-execution-provider';
import { parseQaWithdrawalPolicies } from '../../apps/desktop/src/main/infrastructure/qa-withdrawal-policies';
import { parseQaExecutionProfileFile } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { QaEmvOperation } from '../../apps/desktop/src/main/adapters/qa-emv-operation';
import { parseCardTlv } from '../../apps/desktop/src/main/adapters/emv-card-identity';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import type { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import { fakeCardSession } from '../helpers/card-identity';
import {
  qaExecutionFixture,
  qaWithdrawalPolicy,
  qaCardFields,
  qaAcResponse,
  qaNow,
  qaCalendar,
} from '../helpers/qa-execution';

function setup() {
  const fixture = qaExecutionFixture();
  const { profile, input, row, target } = fixture;
  target.draft = { ...target.draft, transaction: 'WITHDRAWAL_APPROVED', amount: '20.00' };
  const policy = qaWithdrawalPolicy(profile);
  const policies = {
    read: vi.fn(async () => parseQaWithdrawalPolicies({ version: 1, policies: [policy] })),
  };
  const fake = fakeCardSession([qaAcResponse()]);
  const card = qaCardFields();
  card.set('9F07', Buffer.from('C200', 'hex'));
  card.set('8E', Buffer.concat([Buffer.alloc(8), Buffer.from('0201', 'hex')]));
  const commands: Buffer[] = [];
  const transmit = fake.session.transmit;
  fake.session.transmit = async (command) => {
    commands.push(Buffer.from(command));
    return transmit(command);
  };
  const cards = {
    current: async () =>
      ({
        readId: target.cardReadId,
        status: 'READ',
        applicationId: profile.applicationId,
      }) as CardIdentityReading,
    withTransaction: vi.fn(async (_readId, _signal, use) =>
      use(fake.session, card),
    ) as CardIdentityService['withTransaction'],
  };
  const pin = Buffer.from([49, 50, 51, 52]);
  const pinEntry = { request: vi.fn(async (): Promise<Uint8Array | null> => pin) };
  const cipher = {
    available: vi.fn(async () => true),
    encrypt: vi.fn(async () => Buffer.alloc(8, 0x17)),
  };
  const profiles = {
    read: vi.fn(async () => parseQaExecutionProfileFile(input)),
    reserve: vi.fn(async () => row.reservedSequences.shift()!),
  };
  const provider = new QaWithdrawalExecutionProvider(
    profile,
    profiles,
    policies,
    cards,
    pinEntry,
    cipher,
    () => qaNow,
  );
  return {
    ...fixture,
    policy,
    policies,
    fake,
    commands,
    card,
    cards,
    pin,
    pinEntry,
    cipher,
    profiles,
    provider,
  };
}

describe('contrato privado de retiro', () => {
  it.each([
    { transactionType: '80' },
    { transactionType: 'BOUND_PROFILE' },
    { authorisedAmount: 'ZERO' },
    { field55Source: 'CAPTURE' },
    { environment: 'PROD' },
    { account: 'CURRENT' },
    { currency: '978' },
    { pinAndFixedFields: 'AUTO' },
    { responsePolicy: 'AUTO_RETRY' },
    { allowedAmounts: [] },
    { allowedAmounts: ['0.00'] },
    { allowedAmounts: ['20.00', '20.00'] },
    { allowedAmounts: ['20,00'] },
    { allowedAmounts: [20] },
    { allowedAmounts: 'ANY' },
    { allowedAmounts: ['ANY_POSITIVE_AMOUNT'] },
    { allowedAmounts: null },
    { approvalReference: '' },
    { validationSource: 'CAPTURE_IMPLIED' },
    { pin: 'PRIVATE' },
    { profileFingerprint: 'INVALID' },
  ])('rechaza contrato incompleto o contradictorio %#', (patch) => {
    const { policy } = setup();
    expect(() =>
      parseQaWithdrawalPolicies({ version: 1, policies: [{ ...policy, ...patch }] }),
    ).toThrow('QA_WITHDRAWAL_POLICY_INVALID');
  });
  it('rechaza perfiles duplicados y conserva la configuracion de saldo', () => {
    const f = setup();
    expect(() =>
      parseQaWithdrawalPolicies({ version: 1, policies: [f.policy, f.policy] }),
    ).toThrow();
    expect(parseQaExecutionProfileFile(f.input).profiles[0]!.emv.transactionType).toBe('30');
  });
});

describe('retiro con PIN y EMV nuevos', () => {
  it.each(['0.01', '30.00', '75.25', '1234.56', '9999999999.99'])(
    'permite monto personalizado %s con contrato explicito',
    async (amount) => {
      const f = setup();
      f.policy.allowedAmounts = 'ANY_POSITIVE_AMOUNT';
      f.target.draft.amount = amount;
      expect(await f.provider.inspect(f.target)).toMatchObject({ ready: true });
      const lease = await f.provider.acquire(f.target, new AbortController().signal);
      expect(lease.amount).toBe(amount);
      await lease.validate!();
      f.policy.allowedAmounts = ['20.00'];
      await expect(lease.validate!()).rejects.toThrow('QA_WITHDRAWAL_AMOUNT_NOT_ALLOWED');
      lease.release();
    },
  );
  it.each([null, '', '0.00', '-1.00', '1.001', '1,00', '1e2', '10000000000.00'])(
    'rechaza monto personalizado invalido %s antes de PIN y reserva',
    async (amount) => {
      const f = setup();
      f.policy.allowedAmounts = 'ANY_POSITIVE_AMOUNT';
      f.target.draft.amount = amount;
      expect(await f.provider.inspect(f.target)).toMatchObject({ ready: false });
      await expect(f.provider.acquire(f.target, new AbortController().signal)).rejects.toThrow(
        'QA_WITHDRAWAL_AMOUNT_NOT_ALLOWED',
      );
      expect(f.pinEntry.request).not.toHaveBeenCalled();
      expect(f.profiles.reserve).not.toHaveBeenCalled();
      expect(f.commands).toHaveLength(0);
    },
  );
  it.each(['20.00', '50.00'])(
    'retiro USD %s solicita PIN y aplica la preparacion de saldo',
    async (amount) => {
      const f = setup();
      f.policy.allowedAmounts = ['20.00', '50.00'];
      f.target.draft.amount = amount;
      f.policy.validationSource = 'USER_QA_INSTRUCTION';
      f.policy.transactionType = 'BOUND_PROFILE';
      f.policy.authorisedAmount = 'ZERO';
      f.card.set('9F07', Buffer.from('0E00', 'hex'));
      f.card.set('8E', Buffer.concat([Buffer.alloc(8), Buffer.from('0203', 'hex')]));
      const lease = await f.provider.acquire(f.target, new AbortController().signal);
      const tags = new Map(
        parseCardTlv(lease.privateFields.get(55)!.subarray(4)).map((tag) => [
          tag.tag,
          Buffer.from(tag.value),
        ]),
      );
      expect(lease.amount).toBe(amount);
      expect(tags.get('9F02')).toEqual(Buffer.alloc(6));
      expect(tags.get('9C')).toEqual(Buffer.from(f.profile.emv.transactionType, 'hex'));
      expect(f.commands[0]!.subarray(5, 11)).toEqual(tags.get('9F02'));
      expect(f.commands[0]![29]).toBe(0x30);
      expect(lease.diagnostics).toMatchObject({ tvr: '8000040000', cvmResult: '020300' });
      expect(f.pinEntry.request).toHaveBeenCalledOnce();
      expect(f.cipher.encrypt).toHaveBeenCalledOnce();
      expect(f.commands).toHaveLength(1);
      lease.release();
    },
  );
  it('vincula el monto de retiro a CDOL1, F55 y lease, y borra los datos privados', async () => {
    const f = setup();
    expect(await f.provider.inspect(f.target)).toMatchObject({ ready: true });
    const lease = await f.provider.acquire(f.target, new AbortController().signal);
    const tags = new Map(
      parseCardTlv(lease.privateFields.get(55)!.subarray(4)).map((tag) => [
        tag.tag,
        Buffer.from(tag.value),
      ]),
    );
    expect(lease.amount).toBe('20.00');
    expect(tags.get('9F02')).toEqual(Buffer.from('2000'.padStart(12, '0'), 'hex'));
    expect(tags.get('9C')).toEqual(Buffer.of(1));
    expect(tags.get('9F34')).toEqual(Buffer.from('020100', 'hex'));
    expect(tags.get('95')).toEqual(Buffer.from('8000040000', 'hex'));
    expect(f.commands[0]!.subarray(5, 11)).toEqual(tags.get('9F02'));
    expect(f.commands[0]![29]).toBe(1);
    expect(f.profile.emv.transactionType).toBe('30');
    expect(f.pin.every((byte) => byte === 0)).toBe(true);
    await lease.validate!();
    lease.release();
    expect(
      [...lease.privateFields.values()].every((bytes) => bytes.every((byte) => byte === 0)),
    ).toBe(true);
    expect(f.profiles.reserve).toHaveBeenCalledTimes(1);
  });
  it.each(['missing', 'stale', 'amount', 'unavailable', 'invalid'])(
    'bloquea %s antes del PIN, reserva y APDU',
    async (kind) => {
      const f = setup();
      if (kind === 'missing') f.policies.read.mockResolvedValue([]);
      if (kind === 'stale') f.policy.profileFingerprint = 'a'.repeat(64);
      if (kind === 'amount') f.target.draft.amount = '30.00';
      if (kind === 'unavailable') f.policies.read.mockRejectedValue(Error('PRIVATE_FAILURE'));
      if (kind === 'invalid') f.policy.allowedAmounts = [];
      const readiness = await f.provider.inspect(f.target);
      expect(readiness.ready).toBe(false);
      expect(JSON.stringify(readiness)).not.toContain('PRIVATE_FAILURE');
      await expect(f.provider.acquire(f.target, new AbortController().signal)).rejects.toThrow();
      expect(f.pinEntry.request).not.toHaveBeenCalled();
      expect(f.profiles.reserve).not.toHaveBeenCalled();
      expect(f.commands).toHaveLength(0);
    },
  );
  it('detecta revocacion durante el PIN y no consume una reserva', async () => {
    const f = setup();
    f.pinEntry.request.mockImplementation(async () => {
      f.policies.read.mockResolvedValue([]);
      return f.pin;
    });
    await expect(f.provider.acquire(f.target, new AbortController().signal)).rejects.toThrow(
      'QA_WITHDRAWAL_POLICY_MISSING',
    );
    expect(f.profiles.reserve).not.toHaveBeenCalled();
    expect(f.pin.every((byte) => byte === 0)).toBe(true);
  });
  it('revalida el contrato del lease despues de GENERATE AC', async () => {
    const f = setup();
    const lease = await f.provider.acquire(f.target, new AbortController().signal);
    f.policy.approvalReference = 'CHANGED TEST CONTRACT';
    await expect(lease.validate!()).rejects.toThrow('QA_WITHDRAWAL_POLICY_CHANGED');
    lease.release();
  });
  it.each(['QA_PIN_TIMEOUT', 'PCSC_TIMEOUT'])(
    'conserva %s y no reintenta generacion',
    async (error) => {
      const f = setup();
      f.policy.allowedAmounts = 'ANY_POSITIVE_AMOUNT';
      f.target.draft.amount = '75.25';
      if (error === 'QA_PIN_TIMEOUT') f.pinEntry.request.mockRejectedValue(Error(error));
      else
        f.fake.session.transmit = vi.fn(async () => {
          throw Error(error);
        });
      await expect(f.provider.acquire(f.target, new AbortController().signal)).rejects.toThrow(
        error === 'PCSC_TIMEOUT' ? 'QA_CARD_SESSION_TIMEOUT' : error,
      );
      expect(f.profiles.reserve).toHaveBeenCalledTimes(error === 'PCSC_TIMEOUT' ? 1 : 0);
      if (error === 'PCSC_TIMEOUT') expect(f.fake.session.transmit).toHaveBeenCalledTimes(1);
    },
  );
});

describe('CVM y restricciones de efectivo segun el chip', () => {
  it.each([
    { rules: '0201', usage: '8200', country: '0218', tvr: '8000040000', cvm: '020100' },
    { rules: '0201', usage: '4200', country: '0840', tvr: '8000040000', cvm: '020100' },
    { rules: '02020201', usage: '0E00', country: '0218', tvr: '8010040000', cvm: '020100' },
    { rules: '0206', usage: '8200', country: '0218', tvr: '8000800000', cvm: '3F0001' },
    { rules: '0207', usage: '8200', country: '0218', tvr: '8000040000', cvm: '020700' },
  ])(
    'calcula efectivo con CVM $rules y AUC $usage',
    async ({ rules, usage, country, tvr, cvm }) => {
      const f = setup();
      f.card.set('9F07', Buffer.from(usage, 'hex'));
      f.card.set('5F28', Buffer.from(country, 'hex'));
      const limits = Buffer.alloc(8);
      limits.writeUInt32BE(1000);
      f.card.set('8E', Buffer.concat([limits, Buffer.from(rules, 'hex')]));
      const lease = await f.provider.acquire(f.target, new AbortController().signal);
      expect(lease.diagnostics).toMatchObject({ tvr, cvmResult: cvm });
      lease.release();
    },
  );
  it.each(['9F0206', '9C01', '9F02059C01', '9F02069C019C01'])(
    'rechaza CDOL1 incompleto o contradictorio %s antes de APDU',
    async (dol) => {
      const f = setup();
      f.card.set('8C', Buffer.from(dol, 'hex'));
      await expect(f.provider.acquire(f.target, new AbortController().signal)).rejects.toThrow(
        'QA_EMV_PROFILE_UNSUPPORTED',
      );
      expect(f.commands).toHaveLength(0);
    },
  );
  it('el generador rechaza monto ausente, saldo con monto y tipo 80', async () => {
    const f = setup();
    for (const [policy, amount] of [
      [f.profile.emv, '20.00'],
      [{ ...f.profile.emv, issuerUsage: 'CASH' as const, transactionType: '01' }, undefined],
      [{ ...f.profile.emv, issuerUsage: 'CASH' as const, transactionType: '80' }, '20.00'],
    ] as const) {
      await expect(
        new QaEmvOperation().generate(
          f.fake.session,
          f.card,
          policy,
          qaCalendar,
          new AbortController().signal,
          undefined,
          amount,
        ),
      ).rejects.toThrow('QA_EMV_PROFILE_UNSUPPORTED');
    }
    expect(f.commands).toHaveLength(0);
  });
});
