import {
  compareHistoryEntries,
  parseTransactionHistoryQuery,
  transactionHistoryPageSize,
} from '../../../../packages/domain/src/transaction-history';
import type {
  TransactionHistoryQuery,
  TransactionHistoryPage,
} from '../../../../packages/domain/src/transaction-history';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import { failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';
import type { PreferencesStore } from './ports';

export interface TransactionHistoryReader {
  page(query: TransactionHistoryQuery): Promise<readonly BalanceExecution[]>;
}
export class TransactionHistoryService {
  constructor(
    private readonly journals: Record<
      'BALANCE' | 'WITHDRAWAL' | 'DEPOSIT',
      TransactionHistoryReader
    >,
    private readonly preferences: Pick<PreferencesStore, 'read'>,
  ) {}

  async list(payload: unknown): Promise<Result<TransactionHistoryPage>> {
    const query = parseTransactionHistoryQuery(payload);
    if (!query)
      return failure(
        'VALIDATION_ERROR',
        'Revisa el intervalo, la referencia y la operación del historial QA.',
      );
    try {
      if ((await this.preferences.read()).environment !== 'QA')
        return failure('FORBIDDEN', 'Abre el historial desde Qa.');
      const sources = query.operation
        ? [this.journals[query.operation]]
        : Object.values(this.journals);
      const entries = (await Promise.all(sources.map((source) => source.page(query))))
        .flat()
        .sort(compareHistoryEntries);
      const page = entries.slice(0, transactionHistoryPageSize);
      const last = page.at(-1);
      return {
        ok: true,
        value: {
          entries: page,
          next:
            entries.length > transactionHistoryPageSize && last
              ? { startedAt: last.startedAt, requestId: last.requestId }
              : null,
        },
      };
    } catch {
      // Never publish a partial page: advancing its cursor could skip a failed source.
      return failure(
        'STORAGE_UNAVAILABLE',
        'No se pudo consultar el historial completo. Se conserva la página anterior.',
      );
    }
  }
}
