import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { VisaNetworkManagement } from '../../apps/desktop/src/main/adapters/visa-network-management';
import { networkManagementRequest } from '../helpers/visa-network-management';

describe('gestion de red VISA recibida', () => {
  const codec = new VisaNetworkManagement();
  it('proyecta STAN/tipo/codigo sin cabecera ni datos privados', () => {
    const source = networkManagementRequest();
    const metadata = codec.inspect(source);
    expect(metadata).toEqual({
      mti: '0800',
      networkCode: '072',
      stan: '654321',
      bodyBytes: 56,
      fields: [7, 11, 63, 70],
    });
    expect(JSON.stringify(metadata)).not.toContain('12345');
  });
  it('construye 0810 con politica explicita y preserva correlacion/bytes opacos', () => {
    const source = networkManagementRequest(),
      original = Buffer.from(source);
    const reply = codec.reply(source, '00');
    expect(source).toEqual(original);
    expect(reply.body.readUInt16BE(3)).toBe(58);
    expect(reply.body.readUInt16BE(22)).toBe(0x0810);
    expect(reply.body.subarray(5, 8)).toEqual(source.subarray(8, 11));
    expect(reply.body.subarray(8, 11)).toEqual(source.subarray(5, 8));
    expect(reply.body[28]).toBe(2);
    expect(reply.body.subarray(40, 48)).toEqual(source.subarray(40, 48));
    expect(reply.body.subarray(48, 50)).toEqual(Buffer.from([0xf0, 0xf0]));
    expect(reply.body.subarray(50)).toEqual(source.subarray(48));
    expect(reply.metadata).toMatchObject({
      mti: '0810',
      stan: '654321',
      responseCode: '00',
      fields: [7, 11, 39, 63, 70],
    });
    source.fill(0);
    expect(reply.body.readUInt16BE(22)).toBe(0x0810);
  });
  it.each(['', '0', '000', 'A0', ' 0', 'é0'])(
    'rechaza codigo de respuesta no configurado/valido %s',
    (code) => {
      expect(() => codec.reply(networkManagementRequest(), code)).toThrow(
        'VISA_NETWORK_RESPONSE_CODE_INVALID',
      );
    },
  );
  it.each([0, 55, 57])('rechaza longitud %i', (size) => {
    expect(() => codec.inspect(Buffer.alloc(size))).toThrow('VISA_NETWORK_UNSUPPORTED');
  });
  it.each([0, 3, 22, 24, 28, 40, 48, 54])(
    'rechaza estructura o campo ajeno en offset %i',
    (offset) => {
      const source = networkManagementRequest();
      source[offset] = 0xff;
      expect(() => codec.inspect(source)).toThrow(/^VISA_NETWORK_UNSUPPORTED$/);
    },
  );
  it('rechaza un MTI financiero aunque conserve el resto del layout', () => {
    const source = networkManagementRequest();
    source.writeUInt16BE(0x0200, 22);
    expect(() => codec.reply(source, '00')).toThrow('VISA_NETWORK_UNSUPPORTED');
  });
  it('identifica el codigo 071 observado en la conexion QA sin asignarle significado', () => {
    const source = networkManagementRequest();
    source.writeUInt16BE(0x0071, 54);
    expect(codec.inspect(source).networkCode).toBe('071');
    const reply = codec.reply(source, '91');
    expect(reply.metadata.networkCode).toBe('071');
    expect(reply.body.readUInt16BE(56)).toBe(0x0071);
  });
  it('no acepta otros codigos de gestion sin evidencia', () => {
    const source = networkManagementRequest();
    source.writeUInt16BE(0x0001, 54);
    expect(() => codec.inspect(source)).toThrow('VISA_NETWORK_UNSUPPORTED');
  });
  it.each([10, null, undefined])('rechaza codigo de respuesta no textual %s', (code) => {
    expect(() => codec.reply(networkManagementRequest(), code as unknown as string)).toThrow(
      'VISA_NETWORK_RESPONSE_CODE_INVALID',
    );
  });
});
