import { describe, expect, it, vi } from 'vitest';
import { QaEmvOperation } from '../../apps/desktop/src/main/adapters/qa-emv-operation';
import { parseCardTlv } from '../../apps/desktop/src/main/adapters/emv-card-identity';
import { fakeCardSession, success, tlv } from '../helpers/card-identity';
import {
  qaAcResponse,
  qaCalendar,
  qaCardFields,
  qaExecutionFixture,
} from '../helpers/qa-execution';

describe('primera AC de saldo QA', () => {
  it('construye CDOL del chip y F55 con ARQC/ATC nuevos y numero impredecible', async () => {
    const { profile } = qaExecutionFixture();
    const commands: Buffer[] = [],
      counters: string[] = [],
      nonces: string[] = [];
    for (const atc of [1, 2]) {
      const fake = fakeCardSession([qaAcResponse(atc)]);
      const transmit = fake.session.transmit;
      fake.session.transmit = async (command) => {
        commands.push(Buffer.from(command));
        return transmit(command);
      };
      const data = await new QaEmvOperation().generate(
        fake.session,
        qaCardFields(),
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      );
      const tags = new Map(parseCardTlv(data).map((node) => [node.tag, Buffer.from(node.value)]));
      expect(tags.get('9F27')).toEqual(Buffer.of(0x80));
      expect(tags.get('95')).toEqual(Buffer.from('8000040000', 'hex'));
      expect(tags.get('9F34')).toEqual(Buffer.from('020300', 'hex'));
      counters.push(tags.get('9F36')!.toString('hex'));
      nonces.push(tags.get('9F37')!.toString('hex'));
      const command = commands.at(-1)!;
      expect(command.subarray(0, 5)).toEqual(Buffer.from('80AE80001D', 'hex'));
      expect(command.subarray(5, 17)).toEqual(Buffer.alloc(12));
      expect(command.subarray(-5, -1)).toEqual(tags.get('9F37'));
      expect(fake.commands[0]!.every((byte) => byte === 0)).toBe(true);
    }
    expect(counters).toEqual(['0001', '0002']);
    expect(nonces[0]).not.toBe(nonces[1]);
  });
  it.each(['00', '01', '02'])(
    'incluye 5F34=%s desde el chip aunque el perfil previo omita el tag',
    async (sequence) => {
      const { profile } = qaExecutionFixture();
      const card = qaCardFields();
      card.set('5F34', Buffer.from(sequence, 'hex'));
      const fake = fakeCardSession([qaAcResponse()]);
      const output = await new QaEmvOperation().generate(
        fake.session,
        card,
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      );
      const tags = parseCardTlv(output).filter((tag) => tag.tag === '5F34');
      expect(tags).toHaveLength(1);
      expect(Buffer.from(tags[0]!.value)).toEqual(Buffer.from(sequence, 'hex'));
      expect(card.get('5F34')).toEqual(Buffer.from(sequence, 'hex'));
      expect(profile.emv.field55Tags).not.toContain('5F34');
    },
  );
  it('conserva una sola copia de 5F34 cuando el perfil ya lo declara', async () => {
    const { profile } = qaExecutionFixture();
    profile.emv.field55Tags = ['5F34', ...profile.emv.field55Tags];
    const fake = fakeCardSession([qaAcResponse()]);
    const output = await new QaEmvOperation().generate(
      fake.session,
      qaCardFields(),
      profile.emv,
      qaCalendar,
      new AbortController().signal,
    );
    const tags = parseCardTlv(output);
    expect(tags[0]!.tag).toBe('5F34');
    expect(tags.filter((tag) => tag.tag === '5F34')).toHaveLength(1);
  });
  it.each([Buffer.alloc(0), Buffer.of(0, 1), Buffer.of(0xfa)])(
    'bloquea una secuencia de aplicacion invalida antes de generar AC',
    async (sequence) => {
      const { profile } = qaExecutionFixture();
      const card = qaCardFields();
      card.set('5F34', sequence);
      const fake = fakeCardSession();
      await expect(
        new QaEmvOperation().generate(
          fake.session,
          card,
          profile.emv,
          qaCalendar,
          new AbortController().signal,
        ),
      ).rejects.toThrow('QA_EMV_PROFILE_UNSUPPORTED');
      expect(fake.commands).toHaveLength(0);
    },
  );
  it.each(['8C', '8E', '9F07', '9F08', '82', '5F34'])(
    'bloquea datos obligatorios ausentes: %s',
    async (tag) => {
      const { profile } = qaExecutionFixture();
      const card = qaCardFields();
      card.delete(tag);
      const fake = fakeCardSession([qaAcResponse()]);
      await expect(
        new QaEmvOperation().generate(
          fake.session,
          card,
          profile.emv,
          qaCalendar,
          new AbortController().signal,
        ),
      ).rejects.toThrow('QA_EMV_PROFILE_UNSUPPORTED');
      expect(fake.commands).toHaveLength(0);
    },
  );
  it('respeta IAC de rechazo cuando la tarjeta esta vencida', async () => {
    const { profile } = qaExecutionFixture();
    const card = qaCardFields();
    card.set('5F24', Buffer.from('251231', 'hex'));
    card.set('9F0E', Buffer.from('0040000000', 'hex'));
    const fake = fakeCardSession([qaAcResponse()]);
    await expect(
      new QaEmvOperation().generate(
        fake.session,
        card,
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      ),
    ).rejects.toThrow('QA_EMV_CARD_DECLINED');
    expect(fake.commands).toHaveLength(0);
  });
  it.each(['0100', '02011E041E051E031F0200000000'])(
    'informa CVM no realizada sin forzar online PIN: %s',
    async (rules) => {
      const { profile } = qaExecutionFixture();
      const card = qaCardFields();
      card.set('8E', Buffer.concat([Buffer.alloc(8), Buffer.from(rules, 'hex')]));
      const fake = fakeCardSession([qaAcResponse()]);
      const data = await new QaEmvOperation().generate(
        fake.session,
        card,
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      );
      const tags = new Map(parseCardTlv(data).map((node) => [node.tag, Buffer.from(node.value)]));
      expect(tags.get('9F34')).toEqual(Buffer.from('3F0001', 'hex'));
      expect(tags.get('95')).toEqual(Buffer.from('8000800000', 'hex'));
      expect(fake.commands).toHaveLength(1);
    },
  );
  it('respeta rechazo del emisor por CVM no satisfactoria', async () => {
    const { profile } = qaExecutionFixture();
    const card = qaCardFields();
    card.set('8E', Buffer.concat([Buffer.alloc(8), Buffer.from('1F02', 'hex')]));
    card.set('9F0E', Buffer.from('0000800000', 'hex'));
    const fake = fakeCardSession([qaAcResponse()]);
    await expect(
      new QaEmvOperation().generate(
        fake.session,
        card,
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      ),
    ).rejects.toThrow('QA_EMV_CARD_DECLINED');
    expect(fake.commands).toHaveLength(0);
  });
  it.each([
    ['41004203', '420300', '8000040000'],
    ['40031F02', '400301', '8000800000'],
    ['1E03', '3F0001', '8000800000'],
  ])('procesa continuacion CVM y conserva el codigo: %s', async (rules, cvm, tvr) => {
    const { profile } = qaExecutionFixture();
    const card = qaCardFields();
    card.set('8E', Buffer.concat([Buffer.alloc(8), Buffer.from(rules, 'hex')]));
    const fake = fakeCardSession([qaAcResponse()]);
    const data = await new QaEmvOperation().generate(
      fake.session,
      card,
      profile.emv,
      qaCalendar,
      new AbortController().signal,
    );
    const tags = new Map(parseCardTlv(data).map((node) => [node.tag, Buffer.from(node.value)]));
    expect(tags.get('9F34')).toEqual(Buffer.from(cvm, 'hex'));
    expect(tags.get('95')).toEqual(Buffer.from(tvr, 'hex'));
  });
  it.each(['010', '0203FF00', '3E00'])(
    'rechaza CVM malformada o fuera del perfil: %s',
    async (rules) => {
      const { profile } = qaExecutionFixture();
      const card = qaCardFields();
      card.set('8E', Buffer.concat([Buffer.alloc(8), Buffer.from(rules, 'hex')]));
      // Include an odd-length list or an unsupported condition/method.
      if (rules === '0203FF00') card.set('8E', Buffer.from('000000000000000002FF', 'hex'));
      const fake = fakeCardSession([qaAcResponse()]);
      await expect(
        new QaEmvOperation().generate(
          fake.session,
          card,
          profile.emv,
          qaCalendar,
          new AbortController().signal,
        ),
      ).rejects.toThrow('QA_EMV_PROFILE_UNSUPPORTED');
      expect(fake.commands).toHaveLength(0);
    },
  );
  it.each([0x00, 0x40])('no transforma CID %i en ARQC', async (cid) => {
    const { profile } = qaExecutionFixture();
    const fake = fakeCardSession([qaAcResponse(1, cid)]);
    await expect(
      new QaEmvOperation().generate(
        fake.session,
        qaCardFields(),
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      ),
    ).rejects.toThrow('QA_EMV_CARD_DECLINED');
  });
  it('rechaza tags duplicados en la respuesta del chip', async () => {
    const { profile } = qaExecutionFixture();
    const fake = fakeCardSession([
      success(tlv('77', tlv('9F27', Buffer.of(0x80)), tlv('9F27', Buffer.of(0x80)))),
    ]);
    await expect(
      new QaEmvOperation().generate(
        fake.session,
        qaCardFields(),
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      ),
    ).rejects.toThrow('QA_EMV_PROFILE_UNSUPPORTED');
  });
  it('cancela antes de GENERATE AC', async () => {
    const { profile } = qaExecutionFixture();
    const fake = fakeCardSession([qaAcResponse()]);
    const abort = new AbortController();
    abort.abort();
    await expect(
      new QaEmvOperation().generate(
        fake.session,
        qaCardFields(),
        profile.emv,
        qaCalendar,
        abort.signal,
      ),
    ).rejects.toThrow();
    expect(fake.commands).toHaveLength(0);
  });
  it('no repite GENERATE AC ante dependencia no disponible', async () => {
    const { profile } = qaExecutionFixture();
    const fake = fakeCardSession();
    fake.session.transmit = vi.fn(async () => {
      throw Error('PCSC_TIMEOUT');
    });
    await expect(
      new QaEmvOperation().generate(
        fake.session,
        qaCardFields(),
        profile.emv,
        qaCalendar,
        new AbortController().signal,
      ),
    ).rejects.toThrow('PCSC_TIMEOUT');
    expect(fake.session.transmit).toHaveBeenCalledTimes(1);
  });
});
