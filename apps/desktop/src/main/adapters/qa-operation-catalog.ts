import type {
  DocumentedOperation,
  OperationCatalog,
} from '../../../../../packages/domain/src/transaction-draft';
import { CmsV36Catalog } from './cms-v36-catalog';

// Keep the operator's QA instruction separate from the vendor's CMS catalogue.
export class QaOperationCatalog implements OperationCatalog {
  readonly entries: readonly DocumentedOperation[] = Object.freeze([
    ...new CmsV36Catalog().entries,
    Object.freeze({
      transaction: 'DEPOSIT' as const,
      account: 'SAVINGS' as const,
      code: '211000',
      accountCode: '10',
      source: Object.freeze({
        title: 'Configuración de prueba QA del operador',
        version: '2026-11-05',
        page: 1,
        document: 'docs/transactions/DEPOSIT.md',
      }),
    }),
  ]);
}
