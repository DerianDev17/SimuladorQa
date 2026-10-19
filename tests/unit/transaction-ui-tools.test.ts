import { describe, expect, it } from 'vitest';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';
import type { SavedCase } from '../../packages/domain/src/saved-cases';
import { caseEvidenceDocuments, isRestrictedCaseText } from '../../packages/domain/src/saved-cases';
import { filterCases } from '../../apps/desktop/src/renderer/case-filters';
import type { CaseFilters } from '../../apps/desktop/src/renderer/case-filters';
import { resolveAtmSelection } from '../../apps/desktop/src/renderer/transaction-setup';

const entityId = '98876f23-7058-40a5-bd47-b72595034732';
const atmId = '7f303361-d6a6-4f55-aa96-f5e5165df346';
const metadata = {
  revision: 1,
  status: 'DRAFT' as const,
  createdAt: '2026-10-11T12:00:00.000Z',
  updatedAt: '2026-10-11T12:00:00.000Z',
};
function catalogFixture(): CatalogSnapshot {
  const draft = {
    environment: 'QA' as const,
    transaction: 'BALANCE' as const,
    scenario: 'BANRED' as const,
    atmId,
    atmRevision: 1,
    account: 'SAVINGS' as const,
    amount: null,
  };
  const saved: SavedCase = {
    ...metadata,
    id: 'f64811c1-7c3c-4f6f-99c6-00cffc5aed53',
    name: 'Consulta sintética',
    environment: 'QA',
    draft,
    evidenceDocuments: caseEvidenceDocuments(draft),
  };
  return {
    environment: 'QA',
    entities: [
      {
        ...metadata,
        id: entityId,
        code: 'SYNTHETIC',
        name: 'Entidad sintética',
        networkType: 'COONECTA',
        active: true,
      },
    ],
    atms: [
      {
        ...metadata,
        id: atmId,
        alias: 'ATM sintético central',
        entityId,
        terminalId: 'TEST-TERM',
        acquirerId: 'TEST-ACQ',
        active: true,
        environment: 'QA',
      },
    ],
    cases: [
      saved,
      {
        ...saved,
        id: '4e0108ae-ec22-49f9-998b-8605c8aac577',
        name: 'Retiro sintético',
        draft: {
          ...draft,
          transaction: 'WITHDRAWAL_APPROVED',
          account: 'CURRENT',
          amount: '100.50',
          atmRevision: 2,
        },
      },
    ],
    audit: [],
  };
}
const filters: CaseFilters = { query: '', transaction: 'ALL', atm: 'ALL' };

describe('selección del ATM creado para el borrador', () => {
  it('devuelve el perfil y revisión reales de un catálogo activo', () => {
    const catalog = catalogFixture();
    expect(resolveAtmSelection({ environment: 'QA', id: atmId, revision: 1 }, catalog)).toBe(
      catalog.atms[0],
    );
  });
  it('rechaza un ID desconocido, otra revisión y otro ambiente', () => {
    const catalog = catalogFixture();
    for (const selection of [
      { environment: 'QA' as const, id: entityId, revision: 1 },
      { environment: 'QA' as const, id: atmId, revision: 2 },
      { environment: 'PREPROD' as const, id: atmId, revision: 1 },
    ])
      expect(resolveAtmSelection(selection, catalog)).toBeUndefined();
  });
  it('rechaza ATM eliminado, inactivo, de otro ambiente y entidad inexistente o inactiva', () => {
    const catalog = catalogFixture();
    const selection = { environment: 'QA' as const, id: atmId, revision: 1 };
    for (const changed of [
      { ...catalog, atms: [] },
      { ...catalog, atms: [{ ...catalog.atms[0]!, active: false }] },
      { ...catalog, atms: [{ ...catalog.atms[0]!, environment: 'PREPROD' as const }] },
      { ...catalog, entities: [] },
      { ...catalog, entities: [{ ...catalog.entities[0]!, active: false }] },
    ])
      expect(resolveAtmSelection(selection, changed)).toBeUndefined();
  });
});

describe('búsqueda y filtros locales de casos', () => {
  it('mantiene el orden y no modifica datos al buscar sin filtros', () => {
    const catalog = catalogFixture();
    const before = structuredClone(catalog);
    expect(filterCases(catalog, filters)).toEqual(catalog.cases);
    expect(catalog).toEqual(before);
  });
  it.each(['  CONSULTA SINTETICA  ', 'consulta sintética'])(
    'ignora espacios, mayúsculas y acentos: %s',
    (query) => {
      expect(filterCases(catalogFixture(), { ...filters, query }).map((item) => item.name)).toEqual(
        ['Consulta sintética'],
      );
    },
  );
  it.each(['ATM sintetico', 'BANRED'])('busca por alias ATM y escenario: %s', (query) => {
    expect(filterCases(catalogFixture(), { ...filters, query })).toHaveLength(2);
  });
  it('busca por operación, cuenta y monto documentales', () => {
    const catalog = catalogFixture();
    for (const query of ['100.50', 'corriente', 'Retiro aprobado'])
      expect(filterCases(catalog, { ...filters, query }).map((item) => item.name)).toEqual([
        'Retiro sintético',
      ]);
  });
  it('combina operación, texto y vigencia sin cambiar una referencia obsoleta', () => {
    const catalog = catalogFixture();
    expect(
      filterCases(catalog, {
        query: 'sintetico',
        transaction: 'WITHDRAWAL_APPROVED',
        atm: 'STALE',
      }),
    ).toEqual([catalog.cases[1]]);
    expect(filterCases(catalog, { ...filters, atm: 'CURRENT' })).toEqual([catalog.cases[0]]);
    expect(
      filterCases(catalog, { ...filters, transaction: 'WITHDRAWAL_APPROVED', atm: 'CURRENT' }),
    ).toEqual([]);
    expect(catalog.cases[1]!.draft.atmRevision).toBe(2);
  });
  it('no considera vigente una entidad desactivada o un ATM ausente', () => {
    const catalog = catalogFixture();
    for (const changed of [
      { ...catalog, atms: [] },
      { ...catalog, entities: [{ ...catalog.entities[0]!, active: false }] },
    ]) {
      expect(filterCases(changed, { ...filters, atm: 'CURRENT' })).toHaveLength(0);
      expect(filterCases(changed, { ...filters, atm: 'STALE' })).toHaveLength(2);
    }
  });
  it('excluye casos y borradores de otro ambiente', () => {
    const catalog = catalogFixture();
    catalog.cases = [
      { ...catalog.cases[0]!, environment: 'PREPROD' },
      { ...catalog.cases[1]!, draft: { ...catalog.cases[1]!.draft, environment: 'PREPROD' } },
    ];
    expect(filterCases(catalog, filters)).toEqual([]);
  });
  it.each(['PIN 1234', '0000 0000 0000 0000', 'token=private', 'salto\nlinea'])(
    'rechaza búsquedas sensibles: %s',
    (query) => {
      expect(isRestrictedCaseText(query)).toBe(true);
      expect(filterCases(catalogFixture(), { ...filters, query })).toEqual([]);
    },
  );
  it('devuelve una lista vacía ante texto sin coincidencias', () => {
    expect(filterCases(catalogFixture(), { ...filters, query: 'inexistente' })).toEqual([]);
  });
});
