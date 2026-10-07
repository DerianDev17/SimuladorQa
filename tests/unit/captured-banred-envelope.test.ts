import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import {
  CapturedBanredEnvelope,
  capturedHeaders,
  capturedMtis,
} from '../../apps/desktop/src/main/adapters/captured-banred-envelope';
import { syntheticBitmap, syntheticEnvelope } from '../helpers/synthetic-envelope';

describe('envolvente observada BANRED', () => {
  const codec = new CapturedBanredEnvelope();
  it('lee estructura y preserva datos opacos sin interpretar campos', () => {
    const body = syntheticEnvelope();
    const parsed = codec.decode(body);
    expect(parsed.metadata).toEqual({
      header: 'ISO016000040',
      mti: '0200',
      fields: [7, 11, 70],
      opaqueDataBytes: 20,
    });
    expect(
      codec.encode(parsed.metadata.header, parsed.metadata.mti, parsed.bitmap, parsed.opaqueData),
    ).toEqual(body);
    body.fill(0);
    expect(parsed.opaqueData.toString()).toBe('opaque-local-fixture');
    expect(JSON.stringify(parsed.metadata)).not.toContain('opaque-local-fixture');
  });
  it.each(capturedMtis)('conserva MTI observado %s', (mti) => {
    expect(codec.decode(syntheticEnvelope(mti)).metadata.mti).toBe(mti);
  });
  it.each(capturedHeaders)('admite la cabecera observada %s sin modificarla', (header) => {
    expect(
      codec.decode(codec.encode(header, '0200', syntheticBitmap, Buffer.alloc(0))).metadata.header,
    ).toBe(header);
  });
  it('rechaza una fuente incompleta sin incluir bytes en el error', () => {
    expect(() => codec.decode(syntheticEnvelope().subarray(0, 47))).toThrow('ENVELOPE_INVALID');
  });
  it('rechaza bytes de bit alto antes de la conversión ASCII', () => {
    const body = syntheticEnvelope();
    body[0] = body[0]! | 0x80;
    expect(() => codec.decode(body)).toThrow('ENVELOPE_INVALID');
  });
  it('rechaza MTI/header no observados y hex inválido', () => {
    for (const args of [
      ['ISO016000099', '0200', syntheticBitmap],
      ['ISO016000040', '0400', syntheticBitmap],
      ['ISO016000040', '0200', 'G'.repeat(32)],
    ])
      expect(() => codec.encode(args[0]!, args[1]!, args[2]!, Buffer.alloc(0))).toThrow(
        'ENVELOPE_UNSUPPORTED',
      );
  });
  it('rechaza bitmap sin indicador secundario o con indicador terciario', () => {
    for (const index of [16, 32]) {
      const body = syntheticEnvelope();
      body[index] = index === 16 ? 0x30 : 0x38;
      expect(() => codec.decode(body)).toThrow('ENVELOPE_UNSUPPORTED_BITMAP');
    }
  });
  it('rechaza componentes con longitud incorrecta o caracteres multibyte', () => {
    expect(() => codec.encode('ISO01600004', '0200', syntheticBitmap, Buffer.alloc(0))).toThrow(
      'ENVELOPE_INVALID',
    );
    expect(() => codec.encode('ISO01600004é', '0200', syntheticBitmap, Buffer.alloc(0))).toThrow(
      'ENVELOPE_INVALID',
    );
  });
  it('enumera bits de ambas mitades sin interpretar sus valores ni incluir F1', () => {
    const bitmap = Buffer.alloc(16, 0xff);
    bitmap[8] = 0x7f;
    const parsed = codec.decode(
      codec.encode('ISO016000040', '0210', bitmap.toString('hex').toUpperCase(), Buffer.alloc(0)),
    );
    expect(parsed.metadata.fields).toHaveLength(126);
    expect(parsed.metadata.fields).not.toContain(1);
    expect(parsed.metadata.fields).not.toContain(65);
    expect(parsed.metadata.fields).toContain(64);
    expect(parsed.metadata.fields).toContain(128);
  });
});
