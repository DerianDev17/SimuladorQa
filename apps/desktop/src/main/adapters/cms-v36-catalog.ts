import type {
  DocumentedOperation,
  OperationCatalog,
} from '../../../../../packages/domain/src/transaction-draft';

// Extreme Mediator CMS v3.6, p. 20 (operación) y p. 17 (tipo de cuenta).
// No incluye red, framing, F3, RC, PIN ni MTI de reverso.
export class CmsV36Catalog implements OperationCatalog {
  readonly entries: readonly DocumentedOperation[] = Object.freeze(
    (['BALANCE', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_DECLINED'] as const).flatMap((transaction) =>
      (['SAVINGS', 'CURRENT'] as const).map((account) =>
        Object.freeze({
          transaction,
          account,
          code:
            transaction === 'BALANCE'
              ? account === 'SAVINGS'
                ? '301000'
                : '302000'
              : account === 'SAVINGS'
                ? '011000'
                : '012000',
          accountCode: account === 'SAVINGS' ? '10' : '20',
          source: Object.freeze({
            title: 'Extreme Mediator CMS',
            version: '3.6',
            page: 20,
            document: 'docs/protocols/EXTREME_MEDIATOR_CMS_REVIEW.md',
          }),
        }),
      ),
    ),
  );
}
