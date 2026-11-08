import { describe, expect, it, vi } from 'vitest';
import {
  QaAtmTemplate,
  QaTemplateContextProvider,
} from '../../apps/desktop/src/main/qa-atm-template';
import { parseQaExecutionProfileFile } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { NewVisaDeposit } from '../../apps/desktop/src/main/adapters/new-visa-deposit';
import type { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import { qaAcResponse, qaCardFields, qaExecutionFixture, qaNow } from '../helpers/qa-execution';
import { templateCatalog } from '../helpers/qa-template';
import { fakeCardSession } from '../helpers/card-identity';

function setup() {
  const source = qaExecutionFixture();
  source.target.draft = { ...source.target.draft, transaction: 'DEPOSIT', amount: '75.25' };
  const catalog = templateCatalog(source.target);
  const profiles = {
    read: vi.fn(async () => parseQaExecutionProfileFile(source.input)),
    reserve: vi.fn(async () => source.row.reservedSequences.shift()!),
  };
  const template = new QaAtmTemplate(profiles, async () => structuredClone(catalog), {
    read: async () => [],
  });
  const commands: Buffer[] = [];
  const cards = {
    current: vi.fn(
      async (): Promise<CardIdentityReading | null> =>
        ({
          readId: source.target.cardReadId,
          status: 'READ',
          applicationId: source.profile.applicationId,
        }) as CardIdentityReading,
    ),
    withTransaction: vi.fn(async (_readId, _signal, use) => {
      const fake = fakeCardSession([qaAcResponse(commands.length + 1)]);
      const transmit = fake.session.transmit;
      fake.session.transmit = async (command) => {
        commands.push(Buffer.from(command));
        return transmit(command);
      };
      return use(fake.session, qaCardFields());
    }) as CardIdentityService['withTransaction'],
  };
  const pins: Buffer[] = [];
  const pinEntry = {
    request: vi.fn(async () => {
      const pin = Buffer.from([49, 50, 51, 52]);
      pins.push(pin);
      return pin;
    }),
  };
  const cipher = {
    available: vi.fn(async () => true),
    encrypt: vi.fn(async () => Buffer.alloc(8, 0x17)),
  };
  const provider = new QaTemplateContextProvider(
    template,
    'DEPOSIT',
    cards,
    pinEntry,
    cipher,
    () => qaNow,
  );
  return { source, catalog, profiles, cards, pins, pinEntry, cipher, provider, commands };
}

describe('contexto de depósito de la plantilla QA', () => {
  it('usa PIN y chip nuevos por solicitud, monto CDOL vinculado y pool compartido', async () => {
    const f = setup();
    const originalProfile = JSON.stringify(f.source.row.emv);
    expect(await f.provider.inspect(f.source.target)).toMatchObject({ ready: true });
    for (const sequence of [650101, 650102]) {
      const lease = await f.provider.acquire(f.source.target, new AbortController().signal);
      try {
        expect(lease).toMatchObject({
          amount: '75.25',
          sequence,
          securitySource: 'GENERATED_TEST_SESSION',
        });
        expect(new NewVisaDeposit().build(lease).metadata).toMatchObject({
          processingCode: '211000',
          amount: '7525'.padStart(12, '0'),
        });
        expect(f.commands.at(-1)!.subarray(5, 11).toString('hex')).toBe('7525'.padStart(12, '0'));
        await lease.validate?.();
      } finally {
        lease.release();
      }
      expect(lease.privateFields.get(52)!.every((byte) => byte === 0)).toBe(true);
    }
    expect(f.pinEntry.request).toHaveBeenCalledTimes(2);
    expect(f.cipher.encrypt).toHaveBeenCalledTimes(2);
    expect(f.profiles.reserve).toHaveBeenCalledTimes(2);
    for (const pin of f.pins) expect(pin.every((byte) => byte === 0)).toBe(true);
    expect(JSON.stringify(f.source.row.emv)).toBe(originalProfile);
  });
  it.each(['card', 'cipher'] as const)('bloquea dependencia ausente: %s', async (missing) => {
    const f = setup();
    if (missing === 'card') f.cards.current.mockResolvedValue(null);
    else f.cipher.available.mockResolvedValue(false);
    expect(await f.provider.inspect(f.source.target)).toMatchObject({ ready: false });
    await expect(
      f.provider.acquire(f.source.target, new AbortController().signal),
    ).rejects.toThrow();
    expect(f.pinEntry.request).not.toHaveBeenCalled();
    expect(f.profiles.reserve).not.toHaveBeenCalled();
  });
  it('revocar el ATM después de preparar impide validar el envío', async () => {
    const f = setup();
    const lease = await f.provider.acquire(f.source.target, new AbortController().signal);
    try {
      f.catalog.atms[0]!.active = false;
      await expect(lease.validate!()).rejects.toThrow();
    } finally {
      lease.release();
    }
  });
});
