import { describe, expect, it } from 'vitest';
import {
  duplicateAtmTerminal,
  matchesAtmSearch,
} from '../../apps/desktop/src/renderer/atm-catalog';
import type { AtmProfile, Entity } from '../../packages/domain/src/catalogs';

const metadata = {
  revision: 1,
  status: 'DRAFT' as const,
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
};
const entity: Entity = {
  ...metadata,
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  code: '205',
  name: 'Entidad sintética',
  active: false,
  networkType: 'COONECTA',
};
const atm: AtmProfile = {
  ...metadata,
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  entityId: entity.id,
  environment: 'QA',
  alias: 'Cajero jardín',
  terminalId: 'TEST0001',
  acquirerId: '123456',
  active: true,
};

describe('búsqueda y validación local del catálogo ATM', () => {
  it.each([' JARDIN ', '205', 'sintetica', '123456', 'test0001', '205 jardin', '  '])(
    'encuentra %j por los identificadores públicos, ignorando acentos y espacios',
    (search) => {
      expect(matchesAtmSearch(atm, entity, search)).toBe(true);
    },
  );
  it('exige todas las palabras y tolera una entidad no disponible', () => {
    expect(matchesAtmSearch(atm, entity, '205 inexistente')).toBe(false);
    expect(matchesAtmSearch(atm, undefined, 'TEST0001')).toBe(true);
    expect(matchesAtmSearch(atm, undefined, '205')).toBe(false);
  });
  it('detecta duplicados incluso inactivos y recorta como el dominio', () => {
    expect(duplicateAtmTerminal([{ ...atm, active: false }], ' TEST0001 ', 'QA', null)).toBe(true);
    expect(duplicateAtmTerminal([atm], 'TEST0002', 'QA', null)).toBe(false);
  });
  it('excluye el registro editado y no cambia la semántica de unicidad de SQLite', () => {
    expect(duplicateAtmTerminal([atm], atm.terminalId, 'QA', atm.id)).toBe(false);
    expect(duplicateAtmTerminal([atm], 'test0001', 'QA', null)).toBe(false);
    expect(duplicateAtmTerminal([atm], atm.terminalId, undefined, null)).toBe(false);
    expect(duplicateAtmTerminal([], atm.terminalId, 'QA', null)).toBe(false);
  });
});
