import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeCardFields,
  exchangeCard,
  parseCardTlv,
  readEmvIdentity,
} from '../../apps/desktop/src/main/adapters/emv-card-identity';
import { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import type { CardReaderAdapter } from '../../packages/domain/src/card-reader';
import {
  fakeCardSession,
  identityResponses,
  success,
  syntheticAid,
  syntheticPan,
  tlv,
} from '../helpers/card-identity';

const base = {
  readId: '2b86d181-9efb-4808-b8a8-876a843876b8',
  readAt: '2026-10-08T20:00:00.000Z',
  readerName: 'CI Reader',
};
const reader: CardReaderAdapter = {
  inspect: async () => ({
    checkedAt: base.readAt,
    identityStatus: 'NOT_READ',
    readers: [{ name: base.readerName, state: 'CARD_PRESENT', atr: '3B00' }],
  }),
};

describe('identidad EMV de contacto', () => {
  afterEach(() => vi.useRealTimers());
  it('lee únicamente el directorio y los registros anunciados por AFL y protege PAN', async () => {
    const { session, commands } = fakeCardSession();
    const result = await readEmvIdentity(session, base);
    expect(result).toMatchObject({
      status: 'READ',
      panMasked: '444444******4444',
      cardholderName: 'QA TESTER',
      expiry: '12/29',
      applicationLabel: 'QA CARD',
    });
    expect(JSON.stringify(result).includes(syntheticPan)).toBe(false);
    expect(commands.map((command) => command[1])).toEqual([0xa4, 0xb2, 0xb2, 0xa4, 0xa8, 0xb2]);
    expect([...commands[5]!]).toEqual([0, 0xb2, 1, 0x14, 0]);
  });
  it('detiene lectura antes de GPO si hay PDOL que necesita parámetros', async () => {
    const { session, commands } = fakeCardSession(identityResponses(true));
    expect(await readEmvIdentity(session, base)).toMatchObject({
      status: 'TERMINAL_DATA_REQUIRED',
      panMasked: null,
    });
    expect(commands).toHaveLength(4);
  });
  it('obtiene CDOL1/CDOL2 del chip y expone solo tags/longitudes sin generar AC', async () => {
    const rows = identityResponses();
    rows[5] = success(
      tlv(
        '70',
        tlv('5A', Buffer.from(syntheticPan, 'hex')),
        tlv('8C', Buffer.from('9F020695059F3704', 'hex')),
        tlv('8D', Buffer.from('8A029505', 'hex')),
      ),
    );
    const fake = fakeCardSession(rows);
    const result = await readEmvIdentity(fake.session, base);
    expect(result.transactionDataRequirements).toEqual({
      cdol1: [
        { tag: '9F02', length: 6 },
        { tag: '95', length: 5 },
        { tag: '9F37', length: 4 },
      ],
      cdol2: [
        { tag: '8A', length: 2 },
        { tag: '95', length: 5 },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(syntheticPan);
    expect(fake.commands.some((command) => command[1] === 0xae)).toBe(false);
  });
  it('conserva CDOL ausentes como null sin reemplazarlos por TDOL', async () => {
    const result = await readEmvIdentity(fakeCardSession().session, base);
    expect(result.transactionDataRequirements).toEqual({ cdol1: null, cdol2: null });
  });
  it('lee preferencias IAC del emisor desde los registros del chip', async () => {
    const rows = identityResponses();
    rows[5] = success(
      tlv(
        '70',
        tlv('9F0E', Buffer.from('0000800000', 'hex')),
        tlv('9F0F', Buffer.from('FFFFFFFFFF', 'hex')),
        tlv('9F0D', Buffer.from('FFFF000000', 'hex')),
      ),
    );
    expect((await readEmvIdentity(fakeCardSession(rows).session, base)).issuerActionCodes).toEqual({
      denial: '0000800000',
      online: 'FFFFFFFFFF',
      default: 'FFFF000000',
    });
  });
  it('distingue IAC ausentes de una tarjeta cuyos registros no fueron leidos', async () => {
    expect((await readEmvIdentity(fakeCardSession().session, base)).issuerActionCodes).toEqual({
      denial: null,
      online: null,
      default: null,
    });
    expect(
      (await readEmvIdentity(fakeCardSession([Buffer.from([0x6a, 0x82])]).session, base))
        .issuerActionCodes,
    ).toBeUndefined();
  });
  it.each(['9F0E', '9F0F', '9F0D'])('rechaza longitud invalida para IAC %s', async (tag) => {
    const rows = identityResponses();
    rows[5] = success(tlv('70', tlv(tag, Buffer.from([0]))));
    await expect(readEmvIdentity(fakeCardSession(rows).session, base)).rejects.toThrow(
      'CARD_DATA_INVALID',
    );
  });
  it.each(['9F02', '9F0200', '9F020695'])(
    'rechaza CDOL truncado o longitud inválida: %s',
    async (hex) => {
      const rows = identityResponses();
      rows[5] = success(tlv('70', tlv('8C', Buffer.from(hex, 'hex'))));
      await expect(readEmvIdentity(fakeCardSession(rows).session, base)).rejects.toThrow(
        'CARD_DATA_INVALID',
      );
    },
  );
  it('rechaza CDOL duplicado entre registros en vez de elegir uno silenciosamente', async () => {
    const rows = identityResponses();
    rows[5] = success(
      tlv('70', tlv('8C', Buffer.from('9505', 'hex')), tlv('8C', Buffer.from('9F3704', 'hex'))),
    );
    await expect(readEmvIdentity(fakeCardSession(rows).session, base)).rejects.toThrow(
      'CARD_DATA_INVALID',
    );
  });
  it('codifica país ISO n3 en BCD únicamente cuando lo solicita la tarjeta', async () => {
    const fake = fakeCardSession(identityResponses(true));
    expect((await readEmvIdentity(fake.session, base, undefined, '218')).status).toBe('READ');
    expect([...fake.commands[4]!]).toEqual([0x80, 0xa8, 0, 0, 4, 0x83, 2, 2, 0x18, 0]);
  });
  it('no rellena PDOL adicionales con valores supuestos', async () => {
    const rows = identityResponses(true);
    rows[3] = success(
      tlv(
        '6F',
        tlv('84', syntheticAid),
        tlv('A5', tlv('9F38', Buffer.from([0x9f, 0x1a, 2, 0x9f, 2, 6]))),
      ),
    );
    const fake = fakeCardSession(rows);
    expect((await readEmvIdentity(fake.session, base, undefined, '218')).status).toBe(
      'TERMINAL_DATA_REQUIRED',
    );
    expect(fake.commands).toHaveLength(4);
  });
  it('no intenta AIDs conocidos ni registros arbitrarios cuando falta el directorio', async () => {
    const { session, commands } = fakeCardSession([Buffer.from([0x6a, 0x82])]);
    expect(await readEmvIdentity(session, base)).toMatchObject({ status: 'DIRECTORY_UNAVAILABLE' });
    expect(commands).toHaveLength(1);
  });
  it('pide selección cuando la tarjeta expone varias aplicaciones', async () => {
    const rows = identityResponses();
    const second = Buffer.from([0xa0, 0, 0, 1, 2]);
    rows[1] = success(tlv('70', tlv('61', tlv('4F', syntheticAid)), tlv('61', tlv('4F', second))));
    const first = fakeCardSession(rows);
    expect(await readEmvIdentity(first.session, base)).toMatchObject({
      status: 'SELECT_APPLICATION',
      applicationId: null,
    });
    expect(first.commands).toHaveLength(3);
    await expect(
      readEmvIdentity(
        fakeCardSession(rows).session,
        base,
        Buffer.from([0xa0, 0, 0, 2, 1]).toString('hex').toUpperCase(),
      ),
    ).rejects.toThrow('CARD_APPLICATION_CHANGED');
    expect(
      (
        await readEmvIdentity(
          fakeCardSession(rows).session,
          base,
          syntheticAid.toString('hex').toUpperCase(),
        )
      ).status,
    ).toBe('READ');
  });
  it('interpreta GPO formato 77 y conserva ausencias como null', async () => {
    const rows = identityResponses();
    rows[4] = success(
      tlv('77', tlv('82', Buffer.from([0, 0])), tlv('94', Buffer.from([0x10, 1, 1, 0]))),
    );
    rows[5] = success(tlv('70', tlv('5F24', Buffer.from('291231', 'hex'))));
    expect(await readEmvIdentity(fakeCardSession(rows).session, base)).toMatchObject({
      status: 'READ',
      panMasked: null,
      cardholderName: null,
      expiry: '12/29',
    });
  });
  it('ignora Track 2 y otros valores que no pertenecen a la proyección', () => {
    const result = decodeCardFields(
      parseCardTlv(
        tlv('70', tlv('57', Buffer.from(syntheticPan, 'hex')), tlv('9F10', Buffer.from('PRIVATE'))),
      ),
    );
    expect(result).toEqual({ panMasked: null, cardholderName: null, expiry: null });
  });
  it.each(['5A80', '5A03FF', '5F248203', '1F80', '70025A', '5F2403291331', '5F2403290230'])(
    'rechaza TLV o fecha inválida: %s',
    (encoded) => {
      expect(() => decodeCardFields(parseCardTlv(Buffer.from(encoded, 'hex')))).toThrow(
        'CARD_DATA_INVALID',
      );
    },
  );
  it('rechaza duplicados y datos numéricos inválidos', () => {
    expect(() =>
      decodeCardFields(
        parseCardTlv(
          tlv(
            '70',
            tlv('5A', Buffer.from(syntheticPan, 'hex')),
            tlv('5A', Buffer.from(syntheticPan, 'hex')),
          ),
        ),
      ),
    ).toThrow();
    expect(() => decodeCardFields(parseCardTlv(tlv('5A', Buffer.from([0x4a]))))).toThrow();
  });
  it.each([
    [0, 1, 1, 0],
    [0x10, 0, 1, 0],
    [0x10, 2, 1, 0],
    [0x10, 1, 1, 2],
    [0x11, 1, 1, 0],
  ])('rechaza AFL inválido sin explorar registros: %j', async (...afl) => {
    const rows = identityResponses();
    rows[4] = success(tlv('80', Buffer.from([0, 0, ...afl])));
    const fake = fakeCardSession(rows);
    await expect(readEmvIdentity(fake.session, base)).rejects.toThrow('CARD_DATA_INVALID');
    expect(fake.commands).toHaveLength(5);
  });
  it('resuelve 61 y 6C con límites sin reenviar un comando rechazado', async () => {
    const fake = fakeCardSession([
      Buffer.from([0x61, 2]),
      Buffer.from([0x6c, 3]),
      Buffer.from([1, 2, 3, 0x90, 0]),
    ]);
    const response = await exchangeCard(fake.session, Buffer.from([0, 0xc0, 0, 0, 0]));
    expect([...response.data]).toEqual([1, 2, 3]);
    expect([...fake.commands[2]!]).toEqual([0, 0xc0, 0, 0, 3]);
    await expect(
      exchangeCard(
        fakeCardSession(Array.from({ length: 8 }, () => Buffer.from([0x61, 1]))).session,
        fake.commands[0]!,
      ),
    ).rejects.toThrow('CARD_DATA_INVALID');
  });
  it('libera el bloqueo y conserva un handle para invalidar retirada incluso con ATR igual', async () => {
    const fake = fakeCardSession();
    const service = new CardIdentityService(reader, async () => fake.session);
    expect(await service.read({ readerName: base.readerName })).toMatchObject({
      ok: true,
      value: { status: 'READ' },
    });
    expect(fake.state.released).toBe(true);
    expect(await service.current()).toMatchObject({ panMasked: '444444******4444' });
    fake.state.valid = false;
    expect(await service.current()).toBeNull();
    expect(fake.state.closed).toBe(true);
  });
  it('comparte comprobaciones concurrentes sin invalidar una sesión vigente', async () => {
    const fake = fakeCardSession();
    const service = new CardIdentityService(reader, async () => fake.session);
    await service.read({ readerName: base.readerName });
    const status = vi.fn(async () => true);
    fake.session.isValid = status;
    const first = service.current(),
      second = service.current();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(status).toHaveBeenCalledTimes(1);
    expect(fake.state.closed).toBe(false);
    service.close();
  });
  it.each([
    undefined,
    {},
    { readerName: '\nCI' },
    { readerName: base.readerName, command: 'PRIVATE' },
    { readerName: base.readerName, applicationId: 'INVALID' },
  ])('valida IPC antes de tocar hardware: %j', async (payload) => {
    const connect = vi.fn();
    expect(await new CardIdentityService(reader, connect).read(payload)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it('protege fallos de dependencia, rechaza concurrencia y recupera tras timeout', async () => {
    vi.useFakeTimers();
    const blocked = fakeCardSession();
    blocked.session.transmit = () => new Promise(() => undefined);
    const good = fakeCardSession();
    let calls = 0;
    const service = new CardIdentityService(
      reader,
      async () => (++calls === 1 ? blocked.session : good.session),
      100,
    );
    const pending = service.read({ readerName: base.readerName });
    expect(await service.read({ readerName: base.readerName })).toMatchObject({
      ok: false,
      error: { code: 'IN_USE' },
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    expect(blocked.state.closed).toBe(true);
    expect(await service.read({ readerName: base.readerName })).toMatchObject({ ok: true });
    service.close();
    expect(good.state.closed).toBe(true);
    const failing = new CardIdentityService(reader, async () => {
      throw Error('PRIVATE');
    });
    const failure = await failing.read({ readerName: base.readerName });
    expect(failure).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(JSON.stringify(failure)).not.toContain('PRIVATE');
  });
});

describe('vigencia y aislamiento de lecturas de tarjeta', () => {
  afterEach(() => vi.useRealTimers());
  it('no permite que una validación tardía tras timeout sobrescriba la lectura nueva', async () => {
    vi.useFakeTimers();
    const old = fakeCardSession();
    let finishOld: ((value: boolean) => void) | undefined;
    old.session.isValid = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finishOld = resolve;
        }),
    );
    const fresh = fakeCardSession();
    let calls = 0;
    const service = new CardIdentityService(
      reader,
      async () => (++calls === 1 ? old.session : fresh.session),
      100,
    );
    const pending = service.read({ readerName: base.readerName });
    await vi.advanceTimersByTimeAsync(0);
    expect(old.session.isValid).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } });
    const latest = await service.read({ readerName: base.readerName });
    expect(latest.ok).toBe(true);
    finishOld?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(await service.current()).toMatchObject(latest.ok ? { readId: latest.value.readId } : {});
    expect(fresh.state.closed).toBe(false);
    service.close();
  });
  it('no devuelve identidad si el servicio se cierra mientras valida la tarjeta', async () => {
    vi.useFakeTimers();
    const fake = fakeCardSession();
    let finish: ((value: boolean) => void) | undefined;
    fake.session.isValid = () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      });
    const service = new CardIdentityService(reader, async () => fake.session);
    const pending = service.read({ readerName: base.readerName });
    await vi.advanceTimersByTimeAsync(0);
    service.close();
    finish?.(true);
    expect(await pending).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(await service.current()).toBeNull();
    expect(fake.state.closed).toBe(true);
  });
  it('un consumidor no puede modificar la identidad almacenada desde las respuestas', async () => {
    const fake = fakeCardSession();
    const service = new CardIdentityService(reader, async () => fake.session);
    const result = await service.read({ readerName: base.readerName });
    expect(result.ok).toBe(true);
    if (result.ok) result.value.applicationLabel = 'MUTATED RESPONSE';
    const current = await service.current();
    expect(current?.applicationLabel).toBe('QA CARD');
    if (current) current.readerName = 'Other Reader';
    expect((await service.current())?.readerName).toBe(base.readerName);
    service.close();
  });
});

describe('privacidad en textos de identidad de tarjeta', () => {
  it.each([' ', '-'])('protege números separados por %j en el titular', (separator) => {
    const text = Array(4).fill('4'.repeat(4)).join(separator);
    const fields = decodeCardFields(parseCardTlv(tlv('70', tlv('5F20', Buffer.from(text)))));
    expect(fields.cardholderName).toBe('[PROTEGIDO]');
    expect(JSON.stringify(fields)).not.toContain(text);
  });
  it('rechaza nombres sensibles con separadores antes de consultar hardware', async () => {
    const inspect = vi.fn(reader.inspect);
    const connect = vi.fn();
    const service = new CardIdentityService({ inspect }, connect);
    const result = await service.read({ readerName: Array(4).fill('4'.repeat(4)).join(' ') });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(inspect).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
  it('protege números separados en etiquetas de aplicación del chip', async () => {
    const rows = identityResponses();
    const label = Array(3).fill('4'.repeat(4)).join(' ');
    rows[1] = success(tlv('70', tlv('61', tlv('4F', syntheticAid), tlv('50', Buffer.from(label)))));
    rows[3] = success(tlv('6F', tlv('84', syntheticAid), tlv('A5', tlv('50', Buffer.from(label)))));
    const result = await readEmvIdentity(fakeCardSession(rows).session, base);
    expect(result.applicationLabel).toBe('[PROTEGIDO]');
    expect(result.applications[0]?.label).toBe('[PROTEGIDO]');
    expect(JSON.stringify(result)).not.toContain(label);
  });
});
