import { describe, expect, it } from 'vitest';
import { CapturedVisaFraming } from '../../apps/desktop/src/main/infrastructure/captured-visa-framing';

const framing = new CapturedVisaFraming();
describe('envolvente VISA capturada, sin reglas de negocio', () => {
  it.each([Buffer.of(0, 0), Buffer.of(0x20, 0x20)])(
    'preserva extension %j y cuerpo',
    (extension) => {
      const frame = framing.encode(Buffer.of(1, 2, 3), extension);
      expect(frame).toEqual(Buffer.from([0, 3, ...extension, 1, 2, 3]));
      const decoder = framing.decoder();
      const [message] = decoder.push(frame);
      decoder.finish();
      expect(message!.extension).toEqual(extension);
      expect(message!.opaqueBody).toEqual(Buffer.of(1, 2, 3));
    },
  );
  it.each([1, 2, 3, 4, 5, 7])('separa cabecera y cuerpo fragmentados en chunks de %i', (size) => {
    const frame = framing.encode(Buffer.of(4, 5, 6), Buffer.of(0, 0));
    const decoder = framing.decoder();
    const messages = [];
    for (let cursor = 0; cursor < frame.length; cursor += size)
      messages.push(...decoder.push(frame.subarray(cursor, cursor + size)));
    decoder.finish();
    expect(messages).toEqual([{ extension: Buffer.of(0, 0), opaqueBody: Buffer.of(4, 5, 6) }]);
  });
  it('separa frames concatenados sin asumir limites de paquete TCP', () => {
    const decoder = framing.decoder();
    const a = framing.encode(Buffer.of(1), Buffer.of(0, 0));
    const b = framing.encode(Buffer.of(2, 3), Buffer.of(0x20, 0x20));
    const messages = decoder.push(Buffer.concat([a, b]));
    decoder.finish();
    expect(messages).toHaveLength(2);
    expect(framing.encode(messages[0]!.opaqueBody, messages[0]!.extension)).toEqual(a);
    expect(framing.encode(messages[1]!.opaqueBody, messages[1]!.extension)).toEqual(b);
  });
  it('copia entradas y resultados sin exponer el buffer reutilizado', () => {
    const body = Buffer.of(1, 2);
    const extension = Buffer.of(0, 0);
    const frame = framing.encode(body, extension);
    body.fill(9);
    extension.fill(9);
    const decoder = framing.decoder();
    const [message] = decoder.push(frame);
    frame.fill(9);
    decoder.push(framing.encode(Buffer.of(8), Buffer.of(0x20, 0x20)));
    decoder.finish();
    expect(message).toEqual({ extension: Buffer.of(0, 0), opaqueBody: Buffer.of(1, 2) });
  });
  it('controla el limite mecanico BE16, sin considerarlo limite del proveedor', () => {
    const encoded = framing.encode(Buffer.alloc(65535), Buffer.of(0, 0));
    expect(encoded.length).toBe(65539);
    const decoder = framing.decoder();
    expect(decoder.push(encoded)[0]!.opaqueBody.length).toBe(65535);
    decoder.finish();
    expect(() => framing.encode(Buffer.alloc(65536), Buffer.of(0, 0))).toThrow('FRAME_TOO_LARGE');
  });
  it.each([Buffer.of(), Buffer.of(0), Buffer.of(0, 0, 0)])(
    'rechaza extension invalida %j',
    (value) => {
      expect(() => framing.encode(Buffer.of(1), value)).toThrow('FRAME_INVALID_EXTENSION');
    },
  );
  it('rechaza valores ajenos al contrato', () => {
    expect(() => framing.encode('sensitive' as unknown as Uint8Array, Buffer.of(0, 0))).toThrow(
      'FRAME_INVALID_INPUT',
    );
    expect(() => framing.decoder().push(null as unknown as Uint8Array)).toThrow(
      'FRAME_INVALID_INPUT',
    );
  });
  it.each([Buffer.of(0), Buffer.of(0, 3, 0), Buffer.of(0, 3, 0, 0, 1)])(
    'rechaza fin de fuente incompleta %j y cierra el decoder',
    (bytes) => {
      const decoder = framing.decoder();
      decoder.push(bytes);
      expect(() => decoder.finish()).toThrow('FRAME_INCOMPLETE');
      expect(() => decoder.push(Buffer.of(1))).toThrow('FRAME_DECODER_CLOSED');
    },
  );
  it('admite cuerpo vacio solo como mecanica de longitud', () => {
    const decoder = framing.decoder();
    expect(decoder.push(Buffer.of(0, 0, 0, 0))).toEqual([
      { extension: Buffer.of(0, 0), opaqueBody: Buffer.of() },
    ]);
    decoder.finish();
    expect(() => decoder.finish()).toThrow('FRAME_DECODER_CLOSED');
  });
});
