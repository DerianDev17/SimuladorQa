import { describe, expect, it } from 'vitest';
import { selectCoonectaSequence } from '../../apps/desktop/src/main/adapters/coonecta-sequence-policy';

describe('origen de secuencia conforme a la DLL activa', () => {
  it('conserva el serial ATM para GrabaAutoTran=N sin requerir consulta BIN o SP', () => {
    expect(
      selectCoonectaSequence({ autoJournal: 'N', atmSerial: 123, binRegistered: null }),
    ).toEqual({ source: 'ATM_SERIAL', sequence: 123 });
  });
  it('conserva el serial para BIN registrado cuando GrabaAutoTran=S', () => {
    expect(
      selectCoonectaSequence({ autoJournal: 'S', atmSerial: 124, binRegistered: true }),
    ).toEqual({ source: 'ATM_SERIAL', sequence: 124 });
  });
  it('requiere lookup antes de decidir si hace falta la secuencia Extreme', () => {
    expect(
      selectCoonectaSequence({ autoJournal: 'S', atmSerial: 125, binRegistered: null }),
    ).toEqual({ source: 'BIN_LOOKUP_REQUIRED' });
    expect(
      selectCoonectaSequence({ autoJournal: 'S', atmSerial: 125, binRegistered: false }),
    ).toEqual({ source: 'EXTREME_SEQUENCE_REQUIRED' });
  });
  it.each([0, 1000000, 1.5, NaN])('rechaza serial fuera del alcance wire %#', (atmSerial) => {
    expect(() =>
      selectCoonectaSequence({ autoJournal: 'N', atmSerial, binRegistered: null }),
    ).toThrow('COONECTA_SEQUENCE_CONTEXT_INVALID');
  });
  it('rechaza valores de configuración no documentados', () => {
    expect(() =>
      selectCoonectaSequence({ autoJournal: 'X', atmSerial: 1, binRegistered: null } as never),
    ).toThrow('COONECTA_SEQUENCE_CONTEXT_INVALID');
  });
});
