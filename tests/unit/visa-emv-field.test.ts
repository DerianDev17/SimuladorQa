import { describe, expect, it } from 'vitest';
import { encodeVisaEmvField } from '../../apps/desktop/src/main/adapters/visa-emv-field';

describe('envolvente EMV ISOBASEI recibida', () => {
  it('incluye version y longitud interna, ademas de la longitud ISO', () => {
    const tlv = Buffer.from('9F2701809F36020001', 'hex');
    expect(encodeVisaEmvField(tlv)).toEqual(Buffer.from('0C0100099F2701809F36020001', 'hex'));
    expect(tlv.toString('hex')).toBe('9f2701809f36020001');
  });
  it('respeta el limite de 255 bytes del campo e impide desbordamiento', () => {
    expect(encodeVisaEmvField(Buffer.alloc(252)).subarray(0, 4)).toEqual(
      Buffer.from('FF0100FC', 'hex'),
    );
    expect(() => encodeVisaEmvField(Buffer.alloc(253))).toThrow('QA_EMV_FIELD_LENGTH_INVALID');
    expect(() => encodeVisaEmvField(Buffer.alloc(0))).toThrow('QA_EMV_FIELD_LENGTH_INVALID');
  });
});
