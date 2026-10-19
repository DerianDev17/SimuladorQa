import { describe, expect, it, vi } from 'vitest';
import { QaBalanceExecutionProvider } from '../../apps/desktop/src/main/qa-balance-execution-provider';
import { parseQaExecutionProfileFile } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import type { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import { fakeCardSession, syntheticPan } from '../helpers/card-identity';
import { qaAcResponse, qaCardFields, qaExecutionFixture, qaNow } from '../helpers/qa-execution';

function setup() {
  const fixture = qaExecutionFixture();
  const { target, profile, input, row } = fixture;
  const pin = Buffer.from([49, 50, 51, 52]);
  const fake = fakeCardSession([qaAcResponse()]);
  const fields = qaCardFields();
  const current = vi.fn(
    async () =>
      ({
        readId: target.cardReadId,
        status: 'READ',
        applicationId: profile.applicationId,
      }) as CardIdentityReading,
  );
  const withTransaction: CardIdentityService['withTransaction'] = async (_readId, _signal, use) =>
    use(fake.session, fields);
  const transactionCalls = vi.fn();
  const cards = {
    current,
    withTransaction: (async (readId, signal, use) => {
      transactionCalls();
      return withTransaction(readId, signal, use);
    }) as CardIdentityService['withTransaction'],
  };
  const pinEntry = { request: vi.fn(async (): Promise<Uint8Array | null> => pin) };
  const cipher = {
    available: vi.fn(async () => true),
    encrypt: vi.fn(async () => Buffer.alloc(8, 0x17)),
  };
  const profiles = {
    read: vi.fn(async () => parseQaExecutionProfileFile(input)),
    reserve: vi.fn(async () => row.reservedSequences.shift()!),
  };
  const provider = new QaBalanceExecutionProvider(
    profile,
    profiles,
    cards,
    pinEntry,
    cipher,
    () => qaNow,
  );
  return {
    ...fixture,
    fields,
    fake,
    pin,
    cards,
    transactionCalls,
    pinEntry,
    cipher,
    profiles,
    provider,
  };
}

describe('proveedor concreto Enviar -> PIN -> operacion nueva', () => {
  it.each([
    {
      digits: 37,
      chip: syntheticPan + 'D2912101' + '0'.repeat(13) + 'F',
      wire: '0' + syntheticPan + 'D2912101' + '0'.repeat(13),
    },
    {
      digits: 36,
      chip: syntheticPan + 'D2912101' + '0'.repeat(12),
      wire: syntheticPan + 'D2912101' + '0'.repeat(12),
    },
  ])(
    'codifica F35 de $digits digitos con el relleno del enlace ISO',
    async ({ digits, chip, wire }) => {
      const test = setup();
      const source = Buffer.from(chip, 'hex');
      test.fields.set('57', source);
      const lease = await test.provider.acquire(test.target, new AbortController().signal);
      try {
        expect(lease.privateFields.get(35)).toEqual(
          Buffer.concat([Buffer.of(digits), Buffer.from(wire, 'hex')]),
        );
        expect(source).toEqual(Buffer.from(chip, 'hex'));
      } finally {
        lease.release();
      }
      expect(lease.privateFields.get(35)!.every((byte) => byte === 0)).toBe(true);
      expect(source).toEqual(Buffer.from(chip, 'hex'));
    },
  );
  it.each([
    ['relleno dentro del Track 2', syntheticPan + 'D2912101F' + '0'.repeat(12) + 'F'],
    ['separador invalido', syntheticPan + 'A2912101' + '0'.repeat(13) + 'F'],
    ['PAN distinto', '5'.repeat(16) + 'D2912101' + '0'.repeat(13) + 'F'],
    ['vencimiento distinto', syntheticPan + 'D2812101' + '0'.repeat(13) + 'F'],
    ['longitud excedida', syntheticPan + 'D2912101' + '0'.repeat(14)],
  ])('rechaza %s antes de cifrar, reservar o generar AC', async (_label, track) => {
    const test = setup();
    test.fields.set('57', Buffer.from(track, 'hex'));
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_CARD_PROFILE_UNSUPPORTED',
    );
    expect(test.cipher.encrypt).not.toHaveBeenCalled();
    expect(test.profiles.reserve).not.toHaveBeenCalled();
    expect(test.fake.commands).toHaveLength(0);
    expect(test.pin.every((byte) => byte === 0)).toBe(true);
  });
  it('prepara datos nuevos, borra PIN y entrega solo referencias publicas fuera del contexto', async () => {
    const test = setup();
    const lease = await test.provider.acquire(test.target, new AbortController().signal);
    expect(lease.sequence).toBe(650101);
    expect(lease.local).toMatchObject({ year: 2026, day: 13, hour: 15 });
    expect(lease.privateFields.get(52)).toEqual(Buffer.alloc(8, 0x17));
    expect(lease.privateFields.get(55)!.length).toBeGreaterThan(12);
    expect(lease.diagnostics).toMatchObject({
      profileId: test.profile.id,
      accountingDate: test.profile.accountingDate,
      terminalApplicationVersion: test.profile.emv.applicationVersion,
      tvr: '8000040000',
      cvmResult: '020300',
    });
    expect(await test.provider.inspect(test.target)).toMatchObject({ sequencesRemaining: 1 });
    expect(test.pin.every((byte) => byte === 0)).toBe(true);
    expect(test.pinEntry.request).toHaveBeenCalledTimes(1);
    expect(test.transactionCalls).toHaveBeenCalledTimes(1);
    expect(test.cipher.encrypt).toHaveBeenCalledTimes(1);
    lease.release();
    expect(
      [...lease.privateFields.values()].every((value) => value.every((byte) => byte === 0)),
    ).toBe(true);
  });
  it('no pide PIN cuando la clave TEST no esta disponible', async () => {
    const test = setup();
    test.cipher.available.mockResolvedValue(false);
    expect(await test.provider.inspect(test.target)).toMatchObject({
      ready: false,
      blockers: [{ id: 'QA-PIN-TEST-KEY' }],
    });
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_PIN_UNAVAILABLE',
    );
    expect(test.pinEntry.request).not.toHaveBeenCalled();
    expect(test.profiles.reserve).not.toHaveBeenCalled();
  });
  it('cancelar PIN no consume secuencia ni cambia ATC', async () => {
    const test = setup();
    test.pinEntry.request.mockResolvedValue(null);
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_PIN_CANCELLED',
    );
    expect(test.profiles.reserve).not.toHaveBeenCalled();
    expect(test.transactionCalls).not.toHaveBeenCalled();
    expect(test.fake.commands).toHaveLength(0);
  });
  it.each(['QA_PIN_TIMEOUT', 'QA_PIN_UNAVAILABLE'])(
    'conserva el diagnostico %s sin consumir secuencia ni generar AC',
    async (code) => {
      const test = setup();
      test.pinEntry.request.mockRejectedValue(Error(code));
      await expect(
        test.provider.acquire(test.target, new AbortController().signal),
      ).rejects.toThrow(code);
      expect(test.profiles.reserve).not.toHaveBeenCalled();
      expect(test.transactionCalls).not.toHaveBeenCalled();
    },
  );
  it('detecta un perfil modificado mientras se ingresa PIN', async () => {
    const test = setup();
    test.pinEntry.request.mockImplementation(async () => {
      test.row.timeZone = 'UTC';
      return test.pin;
    });
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_PROFILE_CHANGED',
    );
    expect(test.profiles.reserve).not.toHaveBeenCalled();
    expect(test.pin.every((byte) => byte === 0)).toBe(true);
  });
  it('no usa una tarjeta de otro BIN aunque mantenga la referencia', async () => {
    const test = setup();
    test.fields.set('5A', Buffer.alloc(8, 0x55));
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_CARD_PROFILE_UNSUPPORTED',
    );
    expect(test.fake.commands).toHaveLength(0);
    expect(test.cipher.encrypt).not.toHaveBeenCalled();
    expect(test.profiles.reserve).not.toHaveBeenCalled();
    expect(test.pin.every((byte) => byte === 0)).toBe(true);
  });
  it('sanitiza fallos de dependencia y no genera AC si el cifrado falla', async () => {
    const test = setup();
    test.cipher.encrypt.mockRejectedValue(Error('sensitive backend error'));
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_PIN_UNAVAILABLE',
    );
    expect(test.fake.commands).toHaveLength(0);
    expect(test.profiles.reserve).not.toHaveBeenCalled();
    expect(test.pin.every((byte) => byte === 0)).toBe(true);
  });
  it('no consume secuencia si falla la sesión antes de acceder al chip', async () => {
    const test = setup();
    test.cards.withTransaction = vi.fn(async () => {
      throw Error('CARD_UNAVAILABLE');
    });
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_CARD_SESSION_UNAVAILABLE',
    );
    expect(test.profiles.reserve).not.toHaveBeenCalled();
    expect(test.cipher.encrypt).not.toHaveBeenCalled();
  });
  it('reserva después del cifrado y antes de generar AC, sin reciclarla si falla el chip', async () => {
    const test = setup();
    test.profiles.reserve.mockImplementation(async () => {
      expect(test.cipher.encrypt).toHaveBeenCalledTimes(1);
      expect(test.fake.commands).toHaveLength(0);
      return test.row.reservedSequences.shift()!;
    });
    test.fake.session.transmit = vi.fn(async () => {
      throw Error('PCSC_TIMEOUT');
    });
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_CARD_SESSION_TIMEOUT',
    );
    expect(test.profiles.reserve).toHaveBeenCalledTimes(1);
    expect(test.row.reservedSequences).toEqual([650102]);
    expect(test.pin.every((byte) => byte === 0)).toBe(true);
  });
  it('un fallo de reserva no genera AC ni expone errores del archivo privado', async () => {
    const test = setup();
    test.profiles.reserve.mockRejectedValue(Error('private storage detail'));
    await expect(test.provider.acquire(test.target, new AbortController().signal)).rejects.toThrow(
      'QA_SEQUENCE_UNAVAILABLE',
    );
    expect(test.fake.commands).toHaveLength(0);
    expect(test.pin.every((byte) => byte === 0)).toBe(true);
  });
});
