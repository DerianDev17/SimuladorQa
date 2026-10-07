import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { CmsV36Catalog } from '../../apps/desktop/src/main/adapters/cms-v36-catalog';
import {
  isDraftAmount,
  parseDraftRequest,
  reviewDraft,
} from '../../packages/domain/src/transaction-draft';
import type { DraftRequest } from '../../packages/domain/src/transaction-draft';
import type { CatalogSnapshot } from '../../packages/domain/src/catalogs';
import { scenarios, transactions } from '../../packages/domain/src/index';

const provider = new CmsV36Catalog();
const request: DraftRequest = {
  environment: 'QA',
  transaction: 'BALANCE',
  scenario: 'LOCAL',
  atmId: null,
  atmRevision: null,
  account: 'SAVINGS',
  amount: null,
};
const emptyCatalog: CatalogSnapshot = { environment: 'QA', entities: [], atms: [], audit: [] };

describe('catálogo documental CMS v3.6', () => {
  it.each([
    ['BALANCE', 'SAVINGS', '301000', '10'],
    ['BALANCE', 'CURRENT', '302000', '20'],
    ['WITHDRAWAL_APPROVED', 'SAVINGS', '011000', '10'],
    ['WITHDRAWAL_APPROVED', 'CURRENT', '012000', '20'],
    ['WITHDRAWAL_DECLINED', 'SAVINGS', '011000', '10'],
    ['WITHDRAWAL_DECLINED', 'CURRENT', '012000', '20'],
  ])(
    'referencia %s/%s sin alterar ceros o inventar códigos',
    (transaction, account, code, accountCode) => {
      expect(
        provider.entries.find(
          (item) => item.transaction === transaction && item.account === account,
        ),
      ).toMatchObject({
        code,
        accountCode,
        source: { title: 'Extreme Mediator CMS', version: '3.6', page: 20 },
      });
    },
  );
  it('no expone códigos de reverso ni 310000 del mockup y mantiene la fuente inmutable', () => {
    expect(provider.entries).toHaveLength(6);
    expect(
      provider.entries.some((item) => item.code === '310000' || item.transaction === 'REVERSAL'),
    ).toBe(false);
    expect(Object.isFrozen(provider.entries)).toBe(true);
    expect(Object.isFrozen(provider.entries[0]?.source)).toBe(true);
    expect(() => {
      provider.entries[0]!.code = 'invalid';
    }).toThrow();
  });
});

describe('borrador sin ejecución ni datos de tarjeta', () => {
  it('valida un borrador sin ATM y conserva los datos como contexto documental', () => {
    expect(parseDraftRequest(request)).toEqual(request);
    expect(reviewDraft(request, emptyCatalog, provider)).toMatchObject({
      status: 'BLOCKED',
      atm: null,
      amount: null,
      operation: { code: '301000' },
    });
  });
  it('mantiene bloqueados los cinco flujos y cuatro escenarios, sin RC ni mensajes fabricados', () => {
    for (const transaction of transactions)
      for (const scenario of scenarios) {
        const original = transaction.id === 'REVERSAL' || transaction.id === 'TIMEOUT_REVERSAL';
        const monetary =
          transaction.id === 'WITHDRAWAL_APPROVED' || transaction.id === 'WITHDRAWAL_DECLINED';
        const candidate = {
          ...request,
          transaction: transaction.id,
          scenario: scenario.id,
          account: original ? null : 'SAVINGS',
          amount: monetary ? '100.50' : null,
        };
        const parsed = parseDraftRequest(candidate);
        expect(parsed).toBeDefined();
        const reviewed = reviewDraft(parsed!, emptyCatalog, provider)!;
        expect(reviewed.status).toBe('BLOCKED');
        expect(reviewed.specification).toBe(transaction.document);
        expect(reviewed).not.toHaveProperty('responseCode');
        expect(reviewed).not.toHaveProperty('raw');
        expect(reviewed.operation === null).toBe(original);
        expect(reviewed.blockers.map((item) => item.id)).toContain('GOLDEN_SAMPLES');
        if (original)
          expect(reviewed.blockers.map((item) => item.id)).toContain('ORIGINAL_TRANSACTION');
        if (monetary) expect(reviewed.blockers.map((item) => item.id)).toContain('AMOUNT_RULES');
      }
  });
  it.each([
    null,
    [],
    { ...request, environment: 'PROD' },
    { ...request, transaction: 'UNKNOWN' },
    { ...request, scenario: 'UNKNOWN' },
    { ...request, account: 'CREDIT' },
    { ...request, atmId: 'untrusted' },
    { ...request, atmRevision: 1 },
    { ...request, atmId: randomUUID(), atmRevision: null },
    { ...request, atmId: randomUUID(), atmRevision: 0 },
    { ...request, pan: '0'.repeat(16) },
    { ...request, pin: 'private' },
    { ...request, code: '310000' },
    { ...request, amount: '0.00' },
    { ...request, transaction: 'REVERSAL' },
  ])('rechaza entradas no documentadas o ambiguas %#', (candidate) => {
    expect(parseDraftRequest(candidate)).toBeUndefined();
  });
  it.each([
    '100',
    '100,50',
    '-100.50',
    '1e2',
    '100.501',
    ' 100.50',
    '001.00',
    '',
    '9'.repeat(12) + '.00',
  ])('rechaza sintaxis de monto inválida: %s', (amount) => {
    expect(
      parseDraftRequest({ ...request, transaction: 'WITHDRAWAL_APPROVED', amount }),
    ).toBeUndefined();
  });
  it('preserva decimales como string sin redondear y no aprueba límites financieros', () => {
    expect(isDraftAmount('0.00')).toBe(true);
    expect(isDraftAmount('0.01')).toBe(true);
    expect(isDraftAmount('9'.repeat(11) + '.99')).toBe(true);
    const parsed = parseDraftRequest({
      ...request,
      transaction: 'WITHDRAWAL_APPROVED',
      amount: '0.00',
    })!;
    expect(reviewDraft(parsed, emptyCatalog, provider)).toMatchObject({
      status: 'BLOCKED',
      amount: '0.00',
    });
  });
  it('rechaza ATM obsoleto, inactivo, de otro ambiente o con entidad inactiva', () => {
    const id = randomUUID();
    const entityId = randomUUID();
    const timestamp = '2026-10-06T12:00:00.000Z';
    const metadata = {
      revision: 1,
      status: 'DRAFT' as const,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const catalog: CatalogSnapshot = {
      environment: 'QA',
      audit: [],
      entities: [
        {
          ...metadata,
          id: entityId,
          code: 'TEST',
          name: 'Synthetic Entity',
          networkType: 'COONECTA',
          active: true,
        },
      ],
      atms: [
        {
          ...metadata,
          id,
          environment: 'QA',
          alias: 'Synthetic ATM',
          entityId,
          terminalId: 'TEST',
          acquirerId: 'TEST',
          active: true,
        },
      ],
    };
    const selected: DraftRequest = { ...request, atmId: id, atmRevision: 1 };
    expect(reviewDraft(selected, catalog, provider)).toMatchObject({
      atm: { id, revision: 1, status: 'DRAFT' },
    });
    expect(reviewDraft({ ...selected, atmRevision: 2 }, catalog, provider)).toBeUndefined();
    expect(reviewDraft({ ...selected, environment: 'PREPROD' }, catalog, provider)).toBeUndefined();
    catalog.atms[0]!.environment = 'PREPROD';
    expect(reviewDraft(selected, catalog, provider)).toBeUndefined();
    catalog.atms[0]!.environment = 'QA';
    catalog.atms[0]!.active = false;
    expect(reviewDraft(selected, catalog, provider)).toBeUndefined();
    catalog.atms[0]!.active = true;
    catalog.entities[0]!.active = false;
    expect(reviewDraft(selected, catalog, provider)).toBeUndefined();
  });
  it('marca el catálogo ausente sin fabricar un código', () => {
    const review = reviewDraft(request, emptyCatalog, { entries: [] })!;
    expect(review.operation).toBeNull();
    expect(review.blockers.map((item) => item.id)).toContain('OPERATION_CATALOG');
  });
  it('rechaza una entrada inválida incluso al invocar directamente el dominio', () => {
    expect(
      reviewDraft(
        { ...request, transaction: 'WITHDRAWAL_APPROVED', amount: '1e2' },
        emptyCatalog,
        provider,
      ),
    ).toBeUndefined();
  });
});
