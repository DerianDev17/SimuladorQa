import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { TransactionHistoryQuery } from '../../../../packages/domain/src/transaction-history';

export interface TransactionHistoryReader {
  page(query: TransactionHistoryQuery): Promise<readonly BalanceExecution[]>;
}
