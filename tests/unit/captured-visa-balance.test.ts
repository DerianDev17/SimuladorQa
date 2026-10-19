import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { capturedBalanceRequest, capturedBalanceResponse } from '../helpers/captured-visa-balance';
import { balanceResponse } from '../helpers/balance-inquiry';

describe('consulta ATM VISA basada en la muestra CB', () => {
  const codec = new CapturedVisaBalance();
  it('proyecta consulta ahorros sin valores privados y reconstruye bytes originales', () => {
    const request = capturedBalanceRequest();
    const metadata = codec.inspect(request);
    expect(metadata).toMatchObject({
      mti: '0200',
      processingCode: '301000',
      stan: '007923',
      terminalId: 'ATM20521',
      amount: '0',
      currency: '840',
      panMask: '411111XXXXXX0000',
      bodyBytes: 532,
    });
    expect(metadata).not.toHaveProperty('pin');
    expect(metadata).not.toHaveProperty('track');
    const rebuilt = codec.rebuildRequest(request);
    expect(rebuilt).toEqual(request);
    request.fill(0);
    expect(codec.inspect(rebuilt).stan).toBe('007923');
  });
  it.each(['00', '14', '91'])(
    'inspecciona codigo %s de respuesta sin inferir resultado Core',
    (code) => {
      const response = codec.inspect(capturedBalanceResponse(code));
      expect(response).toMatchObject({
        mti: '0210',
        stan: '007923',
        responseCode: code,
        bodyBytes: 204,
      });
      expect(response).not.toHaveProperty('balance');
    },
  );
  it('no convierte una respuesta en request', () => {
    expect(() => codec.rebuildRequest(capturedBalanceResponse())).toThrow(
      'BALANCE_SOURCE_UNSUPPORTED',
    );
  });
  it.each([1, 5, 25])(
    'acepta F44 de %i bytes sin publicar ni interpretar su contenido',
    (length) => {
      const metadata = codec.inspect(capturedBalanceRequest());
      const response = balanceResponse(metadata, '96', (fields) => {
        fields.delete(54);
        fields.set(44, Buffer.concat([Buffer.of(length), Buffer.alloc(length, 0x40)]));
      });
      const parsed = codec.response(response);
      expect(parsed.metadata).toMatchObject({ responseCode: '96', rrn: metadata.rrn });
      expect(parsed.metadata.fields).toContain(44);
      expect(parsed.balances).toEqual([]);
      expect(Object.keys(parsed)).toEqual(['metadata', 'balances']);
      expect(parsed.metadata).not.toHaveProperty('additionalResponseData');
    },
  );
  it('mantiene la lectura del saldo cuando la respuesta aprobada incluye F44', () => {
    const response = balanceResponse(codec.inspect(capturedBalanceRequest()), '00', (fields) => {
      fields.set(44, Buffer.of(5, 0x40, 0x40, 0x40, 0x40, 0xf2));
    });
    expect(codec.response(response).balances).toMatchObject([
      { type: '02', amount: '123.45' },
      { type: '01', amount: '234.56' },
    ]);
  });
  it.each<[string, Buffer]>([
    ['vacio', Buffer.of(0)],
    ['excesivo', Buffer.concat([Buffer.of(26), Buffer.alloc(26, 0x40)])],
    ['truncado', Buffer.of(25, 0x40)],
  ])('rechaza F44 %s con error estable', (_name, value) => {
    const response = balanceResponse(codec.inspect(capturedBalanceRequest()), '96', (fields) => {
      fields.delete(54);
      fields.set(44, value);
    });
    expect(() => codec.response(response)).toThrow(/^BALANCE_SOURCE_UNSUPPORTED$/);
  });
  it('conserva la lista cerrada de campos aunque F44 este permitido', () => {
    const response = balanceResponse(codec.inspect(capturedBalanceRequest()), '96', (fields) => {
      fields.set(44, Buffer.of(1, 0x40));
      fields.set(45, Buffer.of(1, 0x40));
    });
    expect(() => codec.response(response)).toThrow('BALANCE_SOURCE_UNSUPPORTED');
  });
  it('rechaza retiro aunque conserve el layout de la consulta', () => {
    const source = capturedBalanceRequest();
    source.set([0x01, 0x10, 0], 41);
    expect(() => codec.rebuildRequest(source)).toThrow('BALANCE_SOURCE_UNSUPPORTED');
  });
  it('rechaza monto no cero antes de preparar envio', () => {
    const source = capturedBalanceRequest();
    source[49] = 1;
    expect(() => codec.rebuildRequest(source)).toThrow('BALANCE_SOURCE_UNSUPPORTED');
  });
  it.each([0, 3, 22, 24, 32, 41, 50, 55, 112, 124, 282, 300])(
    'rechaza estructura, campo o encoding invalido en %i',
    (offset) => {
      const source = capturedBalanceRequest();
      source[offset] = 0xff;
      expect(() => codec.inspect(source)).toThrow('BALANCE_SOURCE_UNSUPPORTED');
    },
  );
  it('detecta longitud variable excesiva sin publicar su contenido', () => {
    const source = capturedBalanceRequest();
    source[520] = 8;
    expect(() => codec.inspect(source)).toThrow(/^BALANCE_SOURCE_UNSUPPORTED$/);
  });
  it('rechaza truncamiento y residuo aunque se modifique la longitud de cabecera', () => {
    const truncated = Buffer.from(capturedBalanceRequest().subarray(0, 531));
    truncated.writeUInt16BE(truncated.length, 3);
    expect(() => codec.inspect(truncated)).toThrow('BALANCE_SOURCE_UNSUPPORTED');
    const residual = Buffer.concat([capturedBalanceRequest(), Buffer.of(0)]);
    residual.writeUInt16BE(residual.length, 3);
    expect(() => codec.inspect(residual)).toThrow('BALANCE_SOURCE_UNSUPPORTED');
  });
});
