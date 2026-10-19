import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import {
  caseAtmAvailable,
  isRestrictedCaseText,
} from '../../../../packages/domain/src/saved-cases';
import { scenarios, transactions } from '../../../../packages/domain/src/index';
import type { TransactionType } from '../../../../packages/domain/src/index';
import { accountTypes } from '../../../../packages/domain/src/transaction-draft';

export interface CaseFilters {
  query: string;
  transaction: TransactionType | 'ALL';
  atm: 'ALL' | 'CURRENT' | 'STALE';
}
const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');

export function filterCases(catalog: CatalogSnapshot, filters: CaseFilters) {
  if (isRestrictedCaseText(filters.query)) return [];
  const query = normalize(filters.query.trim());
  return catalog.cases.filter((saved) => {
    if (
      saved.environment !== catalog.environment ||
      saved.draft.environment !== catalog.environment
    )
      return false;
    const available = caseAtmAvailable(saved, catalog);
    if (filters.transaction !== 'ALL' && saved.draft.transaction !== filters.transaction)
      return false;
    if (filters.atm !== 'ALL' && available !== (filters.atm === 'CURRENT')) return false;
    const atm = catalog.atms.find((item) => item.id === saved.draft.atmId);
    const text = [
      saved.name,
      transactions.find((item) => item.id === saved.draft.transaction)?.label,
      scenarios.find((item) => item.id === saved.draft.scenario)?.label,
      accountTypes.find((item) => item.id === saved.draft.account)?.label,
      saved.draft.amount,
      atm?.alias,
    ]
      .filter(Boolean)
      .join(' ');
    return normalize(text).includes(query);
  });
}
