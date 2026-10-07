import { describe, expect, it } from 'vitest';
import {
  caseAtmAvailable,
  caseEvidenceDocuments,
  parseCaseValues,
  parseSaveCaseRequest,
} from '../../packages/domain/src/saved-cases';
import type { SavedCase } from '../../packages/domain/src/saved-cases';
import type { DraftRequest } from '../../packages/domain/src/transaction-draft';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';

const draft: DraftRequest = {
  environment: 'QA',
  transaction: 'BALANCE',
  scenario: 'BANRED',
  atmId: null,
  atmRevision: null,
  account: 'SAVINGS',
  amount: null,
};
const request = {
  environment: 'QA',
  id: null,
  revision: null,
  values: { name: 'Consulta QA', draft },
};
const id = 'aabbccdd-aabb-4cdd-8aab-aabbccddeeff';

describe('casos documentales locales', () => {
  it('acepta nombres normalizados y los cinco flujos sin inventar originales o resultados', () => {
    expect(
      parseSaveCaseRequest({ ...request, values: { name: ' Consulta QA ', draft } })?.values.name,
    ).toBe('Consulta QA');
    for (const transaction of [
      'BALANCE',
      'WITHDRAWAL_APPROVED',
      'WITHDRAWAL_DECLINED',
      'REVERSAL',
      'TIMEOUT_REVERSAL',
    ] as const) {
      const original = transaction.includes('REVERSAL');
      const values = {
        name: 'Caso local',
        draft: {
          ...draft,
          transaction,
          account: original ? null : 'CURRENT',
          amount: transaction.startsWith('WITHDRAWAL') ? '100.50' : null,
        },
      };
      expect(parseCaseValues(values)).toEqual(values);
    }
  });
  it.each([
    '',
    ' '.repeat(3),
    'x'.repeat(81),
    '0'.repeat(16),
    '0000 0000 0000 0000',
    '0000-0000-0000-0000',
    'PIN 1234',
    'token=private',
    'track 2: private',
    'salto\nde línea',
  ])('rechaza nombres inválidos o sensibles: %s', (name) => {
    expect(parseCaseValues({ name, draft })).toBeUndefined();
  });
  it('rechaza claves adicionales, PROD, ambientes distintos y revisiones inconsistentes', () => {
    for (const value of [
      { ...request, environment: 'PROD' },
      { ...request, environment: 'PREPROD' },
      { ...request, id, revision: null },
      { ...request, id, revision: 0 },
      { ...request, values: { ...request.values, raw: 'private' } },
      { ...request, evidenceDocuments: [] },
      { ...request, values: { ...request.values, draft: { ...draft, pin: 'private' } } },
      {
        ...request,
        values: {
          ...request.values,
          draft: { ...draft, transaction: 'WITHDRAWAL_APPROVED', amount: '1,00' },
        },
      },
    ])
      expect(parseSaveCaseRequest(value)).toBeUndefined();
    expect(parseSaveCaseRequest({ ...request, id, revision: 2 })).toBeDefined();
  });
  it('solo genera referencias documentales y no asigna catálogo CMS a reversos', () => {
    expect(caseEvidenceDocuments(draft)).toContain('docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md');
    expect(
      caseEvidenceDocuments({ ...draft, transaction: 'REVERSAL', account: null }),
    ).not.toContain('docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md');
    expect(
      caseEvidenceDocuments(draft).every(
        (item) => item.startsWith('docs/') && item.endsWith('.md'),
      ),
    ).toBe(true);
  });
  it('detecta ambiente, revisión, ATM eliminado/inactivo y entidad inactiva', () => {
    const metadata = {
      id,
      revision: 1,
      status: 'DRAFT' as const,
      createdAt: '2026-10-07T12:00:00.000Z',
      updatedAt: '2026-10-07T12:00:00.000Z',
    };
    const saved: SavedCase = {
      ...metadata,
      ...request.values,
      environment: 'QA',
      evidenceDocuments: caseEvidenceDocuments(draft),
    };
    const catalog: CatalogSnapshot = {
      environment: 'QA',
      cases: [saved],
      entities: [
        {
          ...metadata,
          code: 'TEST',
          name: 'Synthetic Entity',
          networkType: 'COONECTA',
          active: true,
        },
      ],
      atms: [
        {
          ...metadata,
          alias: 'Synthetic ATM',
          entityId: id,
          terminalId: 'TEST',
          acquirerId: 'TEST',
          active: true,
          environment: 'QA',
        },
      ],
      audit: [],
    };
    expect(caseAtmAvailable(saved, catalog)).toBe(true);
    saved.draft = { ...draft, atmId: id, atmRevision: 1 };
    expect(caseAtmAvailable(saved, catalog)).toBe(true);
    expect(caseAtmAvailable(saved, { ...catalog, environment: 'PREPROD' })).toBe(false);
    expect(caseAtmAvailable(saved, { ...catalog, atms: [] })).toBe(false);
    expect(
      caseAtmAvailable(saved, { ...catalog, atms: [{ ...catalog.atms[0]!, revision: 2 }] }),
    ).toBe(false);
    expect(
      caseAtmAvailable(saved, { ...catalog, atms: [{ ...catalog.atms[0]!, active: false }] }),
    ).toBe(false);
    expect(
      caseAtmAvailable(saved, {
        ...catalog,
        entities: [{ ...catalog.entities[0]!, active: false }],
      }),
    ).toBe(false);
  });
});
