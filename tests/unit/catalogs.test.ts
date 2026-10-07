import { describe, expect, it } from 'vitest';
import {
  catalogLimits,
  parseAtmValues,
  parseDeleteRequest,
  parseEntityValues,
  parseSaveEntityRequest,
  parseSaveAtmRequest,
  selectableAtms,
} from '../../packages/domain/src/catalogs';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entity = { code: ' TEST ', name: ' Test Entity ', networkType: 'COONECTA', active: true };
const atm = {
  alias: ' Test ATM ',
  entityId: id,
  terminalId: ' Test-Terminal ',
  acquirerId: ' Test-Acquirer ',
  active: true,
};

describe('validación de catálogos', () => {
  it('admite campos documentados y solo elimina espacios de los extremos', () => {
    expect(parseEntityValues(entity)).toEqual({ ...entity, code: 'TEST', name: 'Test Entity' });
    expect(parseAtmValues(atm)).toEqual({
      ...atm,
      alias: 'Test ATM',
      terminalId: 'Test-Terminal',
      acquirerId: 'Test-Acquirer',
    });
  });
  it.each([' ', '-', '\u00a0'])(
    'rechaza secuencias sensibles separadas por %j en todos los textos administrativos',
    (separator) => {
      const sensitive = Array(4).fill('0'.repeat(4)).join(separator);
      for (const field of ['code', 'name']) {
        expect(parseEntityValues({ ...entity, [field]: sensitive })).toBeUndefined();
      }
      for (const field of ['alias', 'terminalId', 'acquirerId']) {
        expect(parseAtmValues({ ...atm, [field]: sensitive })).toBeUndefined();
      }
    },
  );
  it.each(['COONECTA', 'BANRED', 'EXTERNAL'])(
    'admite la red %s seleccionada explícitamente',
    (networkType) => {
      expect(parseEntityValues({ ...entity, networkType })?.networkType).toBe(networkType);
    },
  );
  it.each([
    { ...entity, code: '' },
    { ...entity, name: '   ' },
    { ...entity, networkType: 'FRONT' },
    { ...entity, active: 'true' },
    { ...entity, name: 'a'.repeat(catalogLimits.text + 1) },
    { ...entity, code: 'a'.repeat(catalogLimits.code + 1) },
    { ...entity, name: '0'.repeat(16) },
    { ...entity, name: 'test\nname' },
    { ...entity, pin: 'private-secret' },
    null,
    [],
  ])('rechaza campos incompletos, sensibles o no documentados', (values) => {
    expect(parseEntityValues(values)).toBeUndefined();
  });
  it.each([
    { ...atm, alias: '' },
    { ...atm, entityId: 'not-uuid' },
    { ...atm, terminalId: '' },
    { ...atm, acquirerId: ' ' },
    { ...atm, active: 1 },
    { ...atm, terminalId: '0'.repeat(16) },
    { ...atm, fixedFields: { pan: 'private-secret' } },
  ])('rechaza un perfil inválido sin convertir identificadores', (values) => {
    expect(parseAtmValues(values)).toBeUndefined();
  });
  it('distingue creación y edición y exige UUID/revisión para editar/eliminar', () => {
    expect(
      parseSaveEntityRequest({ environment: 'QA', id: null, revision: null, values: entity }),
    ).toBeDefined();
    expect(
      parseSaveAtmRequest({ environment: 'PREPROD', id, revision: 2, values: atm }),
    ).toBeDefined();
    expect(parseDeleteRequest({ environment: 'QA', id, revision: 1 })).toBeDefined();
    for (const metadata of [
      { id, revision: null },
      { id: null, revision: 1 },
      { id, revision: 0 },
      { id, revision: 1.5 },
    ]) {
      expect(
        parseSaveEntityRequest({ environment: 'QA', ...metadata, values: entity }),
      ).toBeUndefined();
    }
    expect(parseDeleteRequest({ environment: 'PROD', id, revision: 1 })).toBeUndefined();
    expect(
      parseSaveEntityRequest({ environment: 'PROD', id: null, revision: null, values: entity }),
    ).toBeUndefined();
    expect(
      parseDeleteRequest({ environment: 'QA', id, revision: 1, sql: 'private' }),
    ).toBeUndefined();
  });
  it('excluye ATM de otro ambiente y ATM/entidades inactivos de la futura selección', () => {
    const record = {
      id,
      revision: 1,
      status: 'DRAFT' as const,
      createdAt: '2026-10-06T12:00:00.000Z',
      updatedAt: '2026-10-06T12:00:00.000Z',
    };
    const catalog: CatalogSnapshot = {
      environment: 'QA',
      audit: [],
      cases: [],
      entities: [{ ...record, ...entity, networkType: 'COONECTA' }],
      atms: [
        { ...record, ...atm, environment: 'QA' },
        { ...record, ...atm, id: 'inactive', active: false, environment: 'QA' },
        { ...record, ...atm, id: 'preprod', environment: 'PREPROD' },
      ],
    };
    expect(selectableAtms(catalog).map((item) => item.id)).toEqual([id]);
    catalog.entities[0]!.active = false;
    expect(selectableAtms(catalog)).toEqual([]);
  });
});
