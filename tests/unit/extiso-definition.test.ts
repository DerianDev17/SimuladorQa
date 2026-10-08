import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { ExtisoDefinitionInspector } from '../../apps/desktop/src/main/adapters/extiso-definition-inspector';
import { syntheticExtisoDefinition } from '../helpers/extiso-definition';

describe('inspeccion de definicion EXTISO', () => {
  const inspector = new ExtisoDefinitionInspector();
  it('lee secciones completas y conserva parametros sin inventar semantica transaccional', () => {
    const source = syntheticExtisoDefinition();
    const result = inspector.inspect(source);
    expect(result.bytesConsumed).toBe(source.length);
    expect(result.fields).toHaveLength(128);
    expect(result.fields[41]).toMatchObject({
      identifier: 41,
      encodingLabel: 'EBCDIC',
      lengthParameter: 8,
    });
    expect(result.mtiField.encodingLabel).toBe('BCD');
    expect(result.messageNames).toEqual([{ mti: '0200', name: 'Authorization Request SMS' }]);
    expect(result.definitionPairs).toEqual([{ mti: '0200', field: 41 }]);
    expect(result.waitPairs).toEqual([{ mti: '0200', field: 41 }]);
    expect(JSON.stringify(result)).not.toContain('synthetic-private-default');
    source.fill(0);
    expect(result.fields[41]?.name).toBe('V041_Synthetic');
  });
  it.each([0, 261, 400, 15841])('rechaza truncamiento de fuente a %i bytes', (length) => {
    expect(() => inspector.inspect(syntheticExtisoDefinition().subarray(0, length))).toThrow(
      'EXTISO_DEFINITION_INVALID',
    );
  });
  it('rechaza datos extra y fuentes excesivas', () => {
    expect(() =>
      inspector.inspect(Buffer.concat([syntheticExtisoDefinition(), Buffer.alloc(1)])),
    ).toThrow('EXTISO_DEFINITION_INVALID');
    expect(() => inspector.inspect(Buffer.alloc(1_048_577))).toThrow('EXTISO_DEFINITION_INVALID');
  });
  it('rechaza firma o version no soportadas', () => {
    const source = syntheticExtisoDefinition();
    source.write('UNKNWN', 0);
    expect(() => inspector.inspect(source)).toThrow('EXTISO_DEFINITION_UNSUPPORTED');
  });
  it.each([128, 130, 262, 384, 15746])('rechaza conteos inconsistentes en offset %i', (offset) => {
    const source = syntheticExtisoDefinition();
    source.writeUInt16LE(65535, offset);
    expect(() => inspector.inspect(source)).toThrow('EXTISO_DEFINITION_INVALID');
  });
  it.each([387, 386 + 41 * 120, 15832, 15834])(
    'rechaza encoding, identidad o asociaciones invalidas en %i',
    (offset) => {
      const source = syntheticExtisoDefinition();
      source[offset] = 255;
      expect(() => inspector.inspect(source)).toThrow('EXTISO_DEFINITION_INVALID');
    },
  );
  it('rechaza texto fuera de los nombres permitidos sin exponerlo en errores', () => {
    const source = syntheticExtisoDefinition();
    source.write('private-value!', 394);
    expect(() => inspector.inspect(source)).toThrow(/^EXTISO_DEFINITION_INVALID$/);
  });
});
