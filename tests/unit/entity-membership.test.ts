import { describe, expect, it } from 'vitest';
import { parseEntityValues } from '../../packages/domain/src/catalogs';
import { parseCoonectaEntityList } from '../../apps/desktop/src/main/adapters/coonecta-entity-list';

const base = { code: '205', name: 'Synthetic Entity', networkType: 'COONECTA', active: true };
const mapping = { institutionPrefix: '8', missingCodes: { CACECH: '312' } };
const row = (name: string, code: string, type: string) =>
  `${name}\t${code}\t99999\t127.0.0.1\t12345\t${type}`;
describe('clasificación administrativa separada de red', () => {
  it('conserva compatibilidad y normaliza las clasificaciones', () => {
    expect(parseEntityValues(base)).toEqual(base);
    expect(parseEntityValues({ ...base, memberTypes: ['EXTERNAL', 'FRONT'] })).toEqual({
      ...base,
      memberTypes: ['FRONT', 'EXTERNAL'],
    });
    expect(parseEntityValues({ ...base, memberTypes: [] })).toEqual({ ...base, memberTypes: [] });
  });
  it.each([
    ['BANRED'],
    ['FRONT', 'FRONT'],
    ['FRONT', 'BACK', 'EXTERNAL', 'HYBRID', 'INVALID'],
    null,
    'FRONT',
    undefined,
  ])('rechaza clasificación no documentada %j', (memberTypes) => {
    expect(parseEntityValues({ ...base, memberTypes })).toBeUndefined();
  });
  it('agrupa ADQ/EMI y conserva conflictos de la fuente sin usar IP/PID como códigos', () => {
    const entries = parseCoonectaEntityList(
      [
        row('Entidad Uno ADQ', '8205', 'BACKEND'),
        row('Entidad Uno EMI', '8205', 'BACKEND'),
        row('Entidad Dos EMI PT (Extreme)', '8232', 'SWITCH EXTERNO'),
        row('Entidad Dos EMI', '8232', 'FRONTEND AUT'),
        row('Entidad Tres ADQ', '8207', 'HIBRIDA'),
        row('Entidad Tres EMI', '8207', 'FRONTEND AUT'),
        row('CACECH ADQ', '', 'SWITCH EXTERNO'),
        row('CACECH EMI', '', 'SWITCH EXTERNO'),
      ].join('\n'),
      mapping,
    );
    expect(entries).toHaveLength(4);
    expect(entries.find((entry) => entry.values.code === '205')).toMatchObject({
      values: { name: 'Entidad Uno', networkType: 'COONECTA', memberTypes: ['BACK'] },
      requiresValidation: false,
    });
    expect(entries.find((entry) => entry.values.code === '232')).toMatchObject({
      values: { memberTypes: ['FRONT', 'EXTERNAL'] },
      requiresValidation: true,
    });
    expect(entries.find((entry) => entry.values.code === '207')).toMatchObject({
      values: { memberTypes: ['FRONT', 'HYBRID'] },
      requiresValidation: true,
    });
    expect(entries.find((entry) => entry.values.code === '312')).toMatchObject({
      values: { name: 'CACECH', memberTypes: ['EXTERNAL'] },
    });
    expect(entries.reduce((sum, entry) => sum + entry.sourceRows.length, 0)).toBe(8);
    expect(JSON.stringify(entries)).not.toContain('127.0.0.1');
    expect(JSON.stringify(entries)).not.toContain('99999');
  });
  it.each([
    '',
    'incomplete',
    row('Missing ADQ', '', 'BACKEND'),
    row('Unknown EMI', '8205', 'UNDEFINED'),
    row('Wrong code EMI', '9205', 'BACKEND'),
    row('0'.repeat(16), '8205', 'BACKEND'),
    [row('One EMI', '8205', 'BACKEND'), row('Different EMI', '8205', 'BACKEND')].join('\n'),
  ])('rechaza fuentes incompletas o ambiguas sin inventar valores', (source) => {
    expect(() => parseCoonectaEntityList(source, mapping)).toThrow();
  });
  it('exige el mapeo aprobado y admite BOM/espacios no separables', () => {
    expect(() =>
      parseCoonectaEntityList(row('Test EMI', '8205', 'BACKEND'), {
        ...mapping,
        institutionPrefix: '',
      }),
    ).toThrow();
    expect(
      parseCoonectaEntityList(
        '\uFEFF' + row('Test EMI', '8205', '\u00a0FRONTEND AUT\u00a0'),
        mapping,
      )[0]?.values.memberTypes,
    ).toEqual(['FRONT']);
  });
});
