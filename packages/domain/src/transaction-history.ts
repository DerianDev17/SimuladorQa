import { isRecord } from './index';
import { isUtcTimestamp, isUuid } from './catalogs';
import type { BalanceExecution } from './balance-inquiry';

export interface TransactionHistoryCursor {
  startedAt: string;
  requestId: string;
}
export interface TransactionHistoryQuery {
  environment: 'QA';
  from?: string;
  to?: string;
  reference?: string;
  operation?: 'BALANCE' | 'WITHDRAWAL' | 'DEPOSIT';
  before?: TransactionHistoryCursor;
}
export interface TransactionHistoryPage {
  entries: readonly BalanceExecution[];
  next: TransactionHistoryCursor | null;
}
export const transactionHistoryPageSize = 50;

export function parseTransactionHistoryQuery(value: unknown): TransactionHistoryQuery | null {
  if (
    !isRecord(value) ||
    value.environment !== 'QA' ||
    Object.keys(value).some(
      (key) => !['environment', 'from', 'to', 'reference', 'operation', 'before'].includes(key),
    )
  )
    return null;
  const result: TransactionHistoryQuery = { environment: 'QA' };
  for (const key of ['from', 'to'] as const) {
    if (Object.hasOwn(value, key)) {
      if (!isUtcTimestamp(value[key])) return null;
      result[key] = value[key] as string;
    }
  }
  if (result.from && result.to && result.from >= result.to) return null;
  if (Object.hasOwn(value, 'reference')) {
    if (
      typeof value.reference !== 'string' ||
      value.reference.length > 120 ||
      !/^[\w .:-]*$/.test(value.reference)
    )
      return null;
    result.reference = value.reference.trim();
  }
  if (Object.hasOwn(value, 'operation')) {
    if (!['BALANCE', 'WITHDRAWAL', 'DEPOSIT'].includes(value.operation as string)) return null;
    result.operation = value.operation as TransactionHistoryQuery['operation'] & string;
  }
  if (Object.hasOwn(value, 'before')) {
    if (
      !isRecord(value.before) ||
      Object.keys(value.before).length !== 2 ||
      !isUtcTimestamp(value.before.startedAt) ||
      !isUuid(value.before.requestId)
    )
      return null;
    result.before = {
      startedAt: value.before.startedAt as string,
      requestId: value.before.requestId as string,
    };
  }
  return result;
}

export function compareHistoryEntries(
  a: TransactionHistoryCursor,
  b: TransactionHistoryCursor,
): number {
  return a.startedAt === b.startedAt
    ? a.requestId === b.requestId
      ? 0
      : a.requestId < b.requestId
        ? 1
        : -1
    : a.startedAt < b.startedAt
      ? 1
      : -1;
}
