import { describe, expect, it } from 'vitest';
import { isDatedBackup, selectActiveSource } from '../../tooling/atm-source-selection.mjs';

describe('copias sin fecha activas según confirmación del usuario', () => {
  it.each([
    'EXTBASE.config20211213',
    'EXTBASE - 20251118.config',
    'ISOBASEI.bin28082024',
    'NdcConfig_10142024.XML',
    'ATMIso8583.dll_20252211',
  ])('excluye respaldo fechado %s', (name) => {
    expect(isDatedBackup(name)).toBe(true);
  });
  it('conserva versiones y modelos como identificadores cuando no hay una fecha calendario', () => {
    expect(isDatedBackup('Extreme.Switch2013PCI.dll')).toBe(false);
    expect(isDatedBackup('EXTREME_ATMS_2017.dll')).toBe(false);
    expect(isDatedBackup('205_NCR6848_Multi_Dip.txt')).toBe(false);
  });
  it('selecciona la copia canónica sin mezclar perfiles EXTBASE/EXTBASEATM', () => {
    const entries = [
      'ConfigFiles/EXTBASE.config20211213',
      'ConfigFiles/EXTBASEATM.config',
      'ConfigFiles/EXTBASE.config',
    ];
    expect(selectActiveSource(entries, 'EXTBASE.config')).toBe('ConfigFiles/EXTBASE.config');
    expect(selectActiveSource(entries, 'EXTBASEATM.config')).toBe('ConfigFiles/EXTBASEATM.config');
  });
  it('no promueve un backup si falta el archivo activo', () => {
    expect(selectActiveSource(['Dotnet/ATMIso8583.dll_20260819'], 'ATMIso8583.dll')).toBeNull();
  });
  it('excluye el directorio de respaldo fechado aunque la DLL conserve su nombre', () => {
    expect(
      selectActiveSource(
        ['Dotnet/Backup_WebATM20200624/ExtremeTools.dll', 'Dotnet/ExtremeTools.dll'],
        'ExtremeTools.dll',
      ),
    ).toBe('Dotnet/ExtremeTools.dll');
  });
  it('rechaza ruta insegura y selección duplicada', () => {
    expect(() => selectActiveSource(['../EXTBASE.config'], 'EXTBASE.config')).toThrow(
      'SOURCE_PATH_INVALID',
    );
    expect(() =>
      selectActiveSource(['A/EXTBASE.config', 'B/EXTBASE.config'], 'EXTBASE.config'),
    ).toThrow('SOURCE_SELECTION_AMBIGUOUS');
  });
});
