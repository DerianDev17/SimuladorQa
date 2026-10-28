import { describe, expect, it, vi } from 'vitest';
import { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import { fakeCardSession, identityResponses } from '../helpers/card-identity';

function fixture() {
  const card = fakeCardSession(Array.from({ length: 4 }, () => identityResponses()).flat());
  card.session.beginTransaction = vi.fn(async () => {});
  const inspect = vi.fn(async () => ({
    checkedAt: new Date().toISOString(),
    identityStatus: 'NOT_READ' as const,
    readers: [{ name: 'CI Reader', state: 'CARD_PRESENT' as const, atr: '3B00' }],
  }));
  const connect = vi.fn(async () => card.session);
  const service = new CardIdentityService({ inspect }, connect, 20);
  const read = async () => {
    const result = await service.read({ readerName: 'CI Reader' });
    if (!result.ok) throw Error(result.error.code);
    return result.value.readId;
  };
  return { card, inspect, connect, service, read, signal: new AbortController().signal };
}

describe('sesión física durante carga', () => {
  it('reutiliza solo el proceso, relee el chip y consume cada identidad una vez', async () => {
    const f = fixture();
    const first = await f.read();
    f.service.beginLoadSession();
    let privateBytes: Uint8Array | undefined;
    await f.service.withTransaction(first, f.signal, async (_session, fields) => {
      privateBytes = fields.get('5A');
    });
    expect(privateBytes?.every((byte) => byte === 0)).toBe(true);
    expect(await f.service.current()).toBeNull();
    await expect(f.service.withTransaction(first, f.signal, async () => {})).rejects.toThrow();
    const second = await f.read();
    expect(second).not.toBe(first);
    await f.service.withTransaction(second, f.signal, async () => {});
    expect(f.connect).toHaveBeenCalledOnce();
    expect(f.inspect).toHaveBeenCalledOnce();
    expect(f.card.commands).toHaveLength(24);
    expect(f.card.session.beginTransaction).toHaveBeenCalledTimes(3);
    expect(f.card.state.closed).toBe(false);
    f.service.endLoadSession();
    expect(f.card.state.closed).toBe(true);
  });
  it('conserva exclusión mientras libera PC/SC y descarta al retirar tarjeta', async () => {
    const f = fixture();
    const id = await f.read();
    f.service.beginLoadSession();
    let release!: () => void;
    f.card.session.releaseTransaction = vi.fn(
      () =>
        new Promise<void>((done) => {
          release = done;
        }),
    );
    const operation = f.service.withTransaction(id, f.signal, async () => {});
    await vi.waitFor(() => expect(f.card.session.releaseTransaction).toHaveBeenCalledOnce());
    expect(await f.service.read({ readerName: 'CI Reader' })).toMatchObject({
      ok: false,
      error: { code: 'IN_USE' },
    });
    release();
    await operation;
    f.service.observePresence(null);
    expect(f.card.state.closed).toBe(true);
    expect(await f.service.current()).toBeNull();
    f.service.endLoadSession();
  });
  it('no entrega un contexto válido si falla la liberación exclusiva', async () => {
    const f = fixture();
    const id = await f.read();
    f.service.beginLoadSession();
    f.card.session.releaseTransaction = async () => {
      throw Error('PCSC_TIMEOUT');
    };
    await expect(f.service.withTransaction(id, f.signal, async () => 'context')).rejects.toThrow(
      'CARD_UNAVAILABLE',
    );
    expect(f.service.isBusy()).toBe(false);
    expect(f.card.state.closed).toBe(true);
    f.service.endLoadSession();
  });
  it.each(['error', 'cancel'] as const)(
    'descarta sesión ante %s durante preparación',
    async (reason) => {
      const f = fixture();
      const id = await f.read();
      f.service.beginLoadSession();
      const controller = new AbortController();
      await expect(
        f.service.withTransaction(id, controller.signal, async () => {
          if (reason === 'cancel') controller.abort();
          else throw Error('DEPENDENCY_UNAVAILABLE');
        }),
      ).rejects.toThrow();
      expect(f.card.state.closed).toBe(true);
      expect(await f.service.current()).toBeNull();
      f.service.endLoadSession();
    },
  );
  it('cierra el proceso retenido si la siguiente lectura agota el plazo', async () => {
    const f = fixture();
    const id = await f.read();
    f.service.beginLoadSession();
    await f.service.withTransaction(id, f.signal, async () => {});
    f.card.session.transmit = () => new Promise(() => {});
    expect(await f.service.read({ readerName: 'CI Reader' })).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    expect(f.card.state.closed).toBe(true);
    f.service.endLoadSession();
  });
});
