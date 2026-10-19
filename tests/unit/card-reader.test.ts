import { describe, expect, it } from 'vitest';
import {
  decodeReaderStatus,
  inspectReader,
} from '../../apps/desktop/src/main/adapters/windows-pcsc-reader';
import { SimulatedCardReader } from '../../apps/desktop/src/main/adapters/simulated-card-reader';
import type { ReaderDevice } from '../../packages/domain/src/card-reader';

const timestamp = '2026-10-08T20:00:00.000Z';
const row = { name: 'Synthetic Reader', state: 'CARD_PRESENT', atr: '3B00' };
describe('estado PC/SC protegido', () => {
  it('identifica presencia sin propagar datos extra de tarjeta', () => {
    const result = decodeReaderStatus(
      JSON.stringify({ ok: true, readers: [{ ...row, pan: 'PRIVATE', pin: 'PRIVATE' }] }),
      timestamp,
    );
    expect(result).toEqual({ checkedAt: timestamp, readers: [row], identityStatus: 'NOT_READ' });
  });
  it('acepta ausencia de lectores', () => {
    expect(decodeReaderStatus('{"ok":true,"readers":[]}', timestamp).readers).toEqual([]);
  });
  it('protege un nombre con identificador largo', () => {
    const source = { ok: true, readers: [{ ...row, name: 'Reader ' + '4'.repeat(16) }] };
    expect(decodeReaderStatus(JSON.stringify(source), timestamp).readers[0]?.name).toBe(
      'Reader [PROTEGIDO]',
    );
  });
  it.each([
    null,
    { ok: false },
    { ok: true, readers: null },
    { ok: true, readers: Array(17).fill(row) },
    { ok: true, readers: [{ ...row, state: 'READY' }] },
    { ok: true, readers: [{ ...row, atr: 'private data' }] },
    { ok: true, readers: [{ ...row, atr: 'AB'.repeat(37) }] },
    { ok: true, readers: [{ ...row, state: 'EMPTY' }] },
    { ok: true, readers: [{ ...row, name: '\nreader' }] },
  ])('rechaza respuesta inválida y estado incoherente sin exponer contenido', (source) => {
    expect(() => decodeReaderStatus(JSON.stringify(source), timestamp)).toThrow();
  });
  it('simula inserción y retiro sin hardware ni referencia mutable compartida', async () => {
    let state: ReaderDevice = { name: 'CI reader', state: 'EMPTY', atr: null };
    const adapter = new SimulatedCardReader(() => ({
      checkedAt: timestamp,
      readers: [state],
      identityStatus: 'NOT_READ',
    }));
    expect((await adapter.inspect()).readers[0]?.state).toBe('EMPTY');
    state = { name: 'CI reader', state: 'CARD_PRESENT', atr: '3B00' };
    const first = await adapter.inspect();
    state.state = 'EMPTY';
    state.atr = null;
    expect(first.readers[0]?.state).toBe('CARD_PRESENT');
    expect((await adapter.inspect()).readers[0]?.state).toBe('EMPTY');
  });
  it('valida IPC antes de consultar hardware', async () => {
    let calls = 0;
    const adapter = {
      inspect: async () => {
        calls++;
        return { checkedAt: timestamp, readers: [], identityStatus: 'NOT_READ' as const };
      },
    };
    expect(await inspectReader(adapter, {})).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(calls).toBe(0);
    expect(await inspectReader(adapter, undefined)).toMatchObject({ ok: true });
  });
  it.each(['PCSC_TIMEOUT', 'private driver failure'])(
    'devuelve error protegido para %s',
    async (message) => {
      const result = await inspectReader(
        {
          inspect: async () => {
            throw Error(message);
          },
        },
        undefined,
      );
      expect(result).toMatchObject({
        ok: false,
        error: { code: message === 'PCSC_TIMEOUT' ? 'TIMEOUT' : 'SERVICE_UNAVAILABLE' },
      });
      expect(JSON.stringify(result)).not.toContain(message);
    },
  );
});

describe('privacidad de nombres de interfaces', () => {
  it.each([' ', '-', '\u00a0'])('protege secuencias sensibles con separador %j', (separator) => {
    const name = 'Reader ' + Array(4).fill('4'.repeat(4)).join(separator);
    expect(
      decodeReaderStatus(JSON.stringify({ ok: true, readers: [{ ...row, name }] }), timestamp)
        .readers[0]?.name,
    ).toBe('Reader [PROTEGIDO]');
  });
});
