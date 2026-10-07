import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { InclusiveBe16Framing } from '../../apps/desktop/src/main/infrastructure/inclusive-be16-framing';

describe('framing BE16 con longitud inclusiva', () => {
  const framing = new InclusiveBe16Framing();
  it('incluye el VLI en la longitud y copia el cuerpo', () => {
    const original = Buffer.from('fixture');
    const frame = framing.encode(original);
    expect(frame.readUInt16BE()).toBe(original.length + 2);
    original.fill(0);
    expect(frame.subarray(2).toString()).toBe('fixture');
  });
  it('acepta el límite representable y rechaza un desbordamiento', () => {
    expect(framing.encode(Buffer.alloc(0xffff - 2)).readUInt16BE()).toBe(0xffff);
    expect(() => framing.encode(Buffer.alloc(0xffff - 1))).toThrow('FRAME_TOO_LARGE');
  });
  it('reconstruye un prefijo y cuerpo fragmentados byte a byte', () => {
    const decoder = framing.decoder();
    const results = [];
    for (const byte of framing.encode(Buffer.from('fixture')))
      results.push(...decoder.push(Buffer.from([byte])));
    expect(results.map((body) => body.toString())).toEqual(['fixture']);
    decoder.finish();
  });
  it('separa mensajes concatenados y conserva un siguiente mensaje parcial', () => {
    const decoder = framing.decoder();
    const first = framing.encode(Buffer.from('one'));
    const second = framing.encode(Buffer.from('two'));
    const chunk = Buffer.concat([first, second, first.subarray(0, 3)]);
    expect(decoder.push(chunk).map((body) => body.toString())).toEqual(['one', 'two']);
    chunk.fill(0);
    expect(decoder.push(first.subarray(3)).map((body) => body.toString())).toEqual(['one']);
    decoder.finish();
  });
  it('procesa un chunk mayor que el buffer sin incrementar su capacidad', () => {
    const decoder = framing.decoder();
    const frame = framing.encode(Buffer.alloc(256, 1));
    expect(decoder.push(Buffer.concat(Array.from({ length: 500 }, () => frame)))).toHaveLength(500);
    decoder.finish();
  });
  it.each([0, 1])('rechaza longitud %s sin reproducir contenido en el error', (length) => {
    const decoder = framing.decoder();
    expect(() => decoder.push(Buffer.from([0, length]))).toThrow('FRAME_INVALID_LENGTH');
    expect(() => decoder.push(Buffer.from('fixture'))).toThrow('FRAME_DECODER_CLOSED');
  });
  it.each([1, 3])('informa captura interrumpida tras %s bytes', (length) => {
    const decoder = framing.decoder();
    decoder.push(framing.encode(Buffer.from('fixture')).subarray(0, length));
    expect(() => decoder.finish()).toThrow('FRAME_INCOMPLETE');
    expect(() => decoder.push(Buffer.alloc(0))).toThrow('FRAME_DECODER_CLOSED');
  });
  it('admite fuente vacía y cuerpo vacío en transporte, sin validarlos como ISO', () => {
    const decoder = framing.decoder();
    expect(decoder.push(Buffer.alloc(0))).toEqual([]);
    expect(decoder.push(framing.encode(Buffer.alloc(0)))).toEqual([Buffer.alloc(0)]);
    decoder.finish();
  });
});
