import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  LegacyQaPinEncryption,
  type QaPinCipher,
  type QaPinRequest,
} from '../../apps/desktop/src/main/adapters/legacy-qa-pin';

function request(): QaPinRequest {
  return {
    environment: 'QA',
    // Synthetic values, unrelated to a real card or user PIN.
    pan: Buffer.from('9'.repeat(16), 'ascii'),
    pin: Buffer.from('1234', 'ascii'),
    keyReference: randomUUID(),
  };
}
function fixture(deadline = 100) {
  const cipher: QaPinCipher = { encrypt: vi.fn(async () => Buffer.alloc(8, 0xa5)) };
  return { cipher, service: new LegacyQaPinEncryption(cipher, deadline) };
}
describe('preparación PIN legacy respaldada por ExtremeTools, sin cifrador real', () => {
  it('prepara el vector mecánico y limpia bloque y salida temporal', async () => {
    const f = fixture();
    const input = request();
    let captured: Uint8Array | undefined;
    const encrypted = Buffer.alloc(8, 0xa5);
    vi.mocked(f.cipher.encrypt).mockImplementation(async (block, key, signal) => {
      expect(Buffer.from(block).toString('hex')).toBe('0412ad6666666666');
      expect(key).toBe(input.keyReference);
      expect(signal.aborted).toBe(false);
      captured = block;
      return encrypted;
    });
    const output = await f.service.encrypt(input, new AbortController().signal);
    expect(output).toEqual(Buffer.alloc(8, 0xa5));
    expect(captured?.every((byte) => byte === 0)).toBe(true);
    expect(encrypted.every((byte) => byte === 0)).toBe(true);
    expect(input.pin).toEqual(Buffer.from('1234'));
    output.fill(0);
  });
  it('conserva D2 decimal de la fuente sin reemplazarlo por una regla ISO supuesta', async () => {
    const f = fixture();
    const input = { ...request(), pin: Buffer.from('1234567890') };
    vi.mocked(f.cipher.encrypt).mockImplementation(async (block) => {
      expect(Buffer.from(block).toString('hex')).toBe('1012adcfe1096666');
      return Buffer.alloc(8, 0xa5);
    });
    (await f.service.encrypt(input, new AbortController().signal)).fill(0);
  });
  it('preserva el padding del PAN corto y excluye el dígito final', async () => {
    const f = fixture();
    vi.mocked(f.cipher.encrypt).mockImplementation(async (block) => {
      expect(Buffer.from(block).toString('hex')).toBe('041234ffffffffff');
      return Buffer.alloc(8, 0xa5);
    });
    (
      await f.service.encrypt({ ...request(), pan: Buffer.from('9') }, new AbortController().signal)
    ).fill(0);
  });
  it.each([
    { environment: 'PROD' },
    { keyReference: 'clear-key-is-not-a-reference' },
    { pan: Buffer.alloc(0) },
    { pan: Buffer.from('9'.repeat(20)) },
    { pan: Buffer.from('999X') },
    { pin: Buffer.alloc(0) },
    { pin: Buffer.from('1234567890' + '12345') },
    { pin: Buffer.from('12X4') },
  ])('rechaza entrada antes de invocar cifrado %#', async (change) => {
    const f = fixture();
    await expect(
      f.service.encrypt({ ...request(), ...change } as QaPinRequest, new AbortController().signal),
    ).rejects.toThrow('QA_PIN_INPUT_INVALID');
    expect(f.cipher.encrypt).not.toHaveBeenCalled();
  });
  it('no invoca el proveedor si la operación ya está cancelada', async () => {
    const f = fixture();
    const abort = new AbortController();
    abort.abort();
    await expect(f.service.encrypt(request(), abort.signal)).rejects.toThrow('QA_PIN_CANCELLED');
    expect(f.cipher.encrypt).not.toHaveBeenCalled();
  });
  it('oculta el error del cifrador y elimina el bloque al fallar', async () => {
    const f = fixture();
    let captured: Uint8Array | undefined;
    vi.mocked(f.cipher.encrypt).mockImplementation(async (block) => {
      captured = block;
      throw Error('provider-private-data');
    });
    await expect(f.service.encrypt(request(), new AbortController().signal)).rejects.toThrow(
      'QA_PIN_UNAVAILABLE',
    );
    expect(captured?.every((byte) => byte === 0)).toBe(true);
  });
  it.each([Buffer.alloc(7), {}])('rechaza respuesta inválida del proveedor %#', async (value) => {
    const f = fixture();
    vi.mocked(f.cipher.encrypt).mockResolvedValue(value as Uint8Array);
    await expect(f.service.encrypt(request(), new AbortController().signal)).rejects.toThrow(
      'QA_PIN_UNAVAILABLE',
    );
  });
  it('rechaza devolver el mismo buffer de entrada como supuesto cifrado', async () => {
    const f = fixture();
    vi.mocked(f.cipher.encrypt).mockImplementation(async (block) => block);
    await expect(f.service.encrypt(request(), new AbortController().signal)).rejects.toThrow(
      'QA_PIN_UNAVAILABLE',
    );
  });
  it('cancela dependencia no disponible y limpia una respuesta tardía', async () => {
    const f = fixture(10);
    let resolve: ((value: Uint8Array) => void) | undefined;
    let captured: Uint8Array | undefined;
    let providerSignal: AbortSignal | undefined;
    vi.mocked(f.cipher.encrypt).mockImplementation((block, _key, signal) => {
      captured = block;
      providerSignal = signal;
      return new Promise((done) => {
        resolve = done;
      });
    });
    await expect(f.service.encrypt(request(), new AbortController().signal)).rejects.toThrow(
      'QA_PIN_UNAVAILABLE',
    );
    expect(captured?.every((byte) => byte === 0)).toBe(true);
    expect(providerSignal?.aborted).toBe(true);
    const late = Buffer.alloc(8, 0xa5);
    resolve?.(late);
    await Promise.resolve();
    await Promise.resolve();
    expect(late.every((byte) => byte === 0)).toBe(true);
  });
  it('propaga cancelación y limpia la memoria sin esperar el timeout', async () => {
    const f = fixture(5000);
    const abort = new AbortController();
    let captured: Uint8Array | undefined;
    vi.mocked(f.cipher.encrypt).mockImplementation((block) => {
      captured = block;
      abort.abort();
      return new Promise(() => undefined);
    });
    await expect(f.service.encrypt(request(), abort.signal)).rejects.toThrow('QA_PIN_CANCELLED');
    expect(captured?.every((byte) => byte === 0)).toBe(true);
  });
  it.each([0, -1, 30001, 1.5])('valida el plazo técnico %#', (deadline) => {
    expect(() => fixture(deadline)).toThrow('QA_PIN_CONFIGURATION_INVALID');
  });
});
