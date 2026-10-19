import { describe, expect, it, vi } from 'vitest';
import { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import {
  fakeCardSession,
  identityResponses,
  success,
  tlv,
  syntheticPan,
} from '../helpers/card-identity';
import { qaCardFields, qaNow } from '../helpers/qa-execution';

async function setup(changeCard = false) {
  const replies = identityResponses();
  replies[4] = success(tlv('80', Buffer.from([0x10, 0, 0x10, 1, 1, 0])));
  replies[5] = success(
    tlv(
      '70',
      ...[...qaCardFields()].filter(([tag]) => tag !== '82').map(([tag, value]) => tlv(tag, value)),
    ),
  );
  const secondRead = replies.map((value) => Buffer.from(value));
  if (changeCard) {
    const fields = qaCardFields();
    fields.set('5A', Buffer.alloc(8, 0x55));
    secondRead[5] = Buffer.from(
      success(
        tlv(
          '70',
          ...[...fields].filter(([tag]) => tag !== '82').map(([tag, value]) => tlv(tag, value)),
        ),
      ),
    );
  }
  const fake = fakeCardSession([...replies, ...secondRead]);
  fake.session.beginTransaction = vi.fn(async () => {
    fake.state.released = false;
  });
  const service = new CardIdentityService(
    {
      inspect: async () => ({
        checkedAt: qaNow.toISOString(),
        identityStatus: 'NOT_READ',
        readers: [{ name: 'Test Reader', state: 'CARD_PRESENT', atr: null }],
      }),
    },
    async () => fake.session,
  );
  const result = await service.read({ readerName: 'Test Reader' });
  if (!result.ok) throw Error('SYNTHETIC_READING_FAILED');
  return { fake, service, result, id: result.value.readId };
}

describe('sesion privada del chip para una operacion', () => {
  it('detecta identidad diferente en la relectura antes de usar datos privados', async () => {
    const { service, fake, id } = await setup(true);
    const use = vi.fn(async () => undefined);
    await expect(service.withTransaction(id, new AbortController().signal, use)).rejects.toThrow(
      'CARD_UNAVAILABLE',
    );
    expect(use).not.toHaveBeenCalled();
    expect(fake.state.closed).toBe(true);
    expect(await service.current()).toBeNull();
  });
  it('retiene campos privados solo en Main, los limpia y consume la lectura', async () => {
    const { service, fake, result, id } = await setup();
    expect(JSON.stringify(result)).not.toContain(syntheticPan);
    let privatePan: Uint8Array | undefined;
    await service.withTransaction(id, new AbortController().signal, async (session, fields) => {
      expect(session).toBe(fake.session);
      privatePan = fields.get('5A');
      expect(privatePan).toEqual(Buffer.from(syntheticPan, 'hex'));
      expect(await service.read({ readerName: 'Test Reader' })).toMatchObject({
        ok: false,
        error: { code: 'IN_USE' },
      });
    });
    expect(fake.session.beginTransaction).toHaveBeenCalledTimes(1);
    expect(privatePan!.every((byte) => byte === 0)).toBe(true);
    expect(fake.state.closed).toBe(true);
    expect(await service.current()).toBeNull();
    await expect(
      service.withTransaction(id, new AbortController().signal, async () => undefined),
    ).rejects.toThrow('CARD_UNAVAILABLE');
  });
  it('cierra el handle y borra datos al cancelar una dependencia pendiente', async () => {
    const { service, fake, id } = await setup();
    const abort = new AbortController();
    let finish: (() => void) | undefined;
    let privatePan: Uint8Array | undefined;
    const started = new Promise<void>((done) => {
      finish = done;
    });
    let ready: (() => void) | undefined;
    const entered = new Promise<void>((done) => {
      ready = done;
    });
    const operation = service.withTransaction(id, abort.signal, async (_session, fields) => {
      privatePan = fields.get('5A');
      ready!();
      await started;
    });
    const rejected = expect(operation).rejects.toThrow('CARD_UNAVAILABLE');
    await entered;
    abort.abort();
    finish!();
    await rejected;
    expect(fake.state.closed).toBe(true);
    expect(privatePan!.every((byte) => byte === 0)).toBe(true);
    expect(await service.current()).toBeNull();
  });
  it('bloquea una tarjeta retirada sin comenzar una operacion', async () => {
    const { service, fake, id } = await setup();
    fake.state.valid = false;
    await expect(
      service.withTransaction(id, new AbortController().signal, async () => undefined),
    ).rejects.toThrow('CARD_UNAVAILABLE');
    expect(fake.session.beginTransaction).not.toHaveBeenCalled();
    expect(fake.state.closed).toBe(true);
  });
});
