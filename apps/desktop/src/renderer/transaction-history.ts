import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { Result } from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';

export type HistorySource = 'balances' | 'withdrawals';
export type HistoryBatch = Record<HistorySource, Result<readonly BalanceExecution[]>>;
export interface TransactionHistoryPort {
  read(): Promise<HistoryBatch>;
}
export function desktopTransactionHistory(client: DesktopClient): TransactionHistoryPort {
  return {
    async read() {
      const [balances, withdrawals] = await Promise.all([
        client.call((api) => api.getBalanceHistory('QA')),
        client.call((api) => api.getWithdrawalHistory('QA')),
      ]);
      return { balances, withdrawals };
    },
  };
}
export interface HistorySnapshot {
  balances: readonly BalanceExecution[];
  withdrawals: readonly BalanceExecution[];
  issues: readonly { source: HistorySource; message: string }[];
  loading: boolean;
  loaded: boolean;
}
const empty: HistorySnapshot = {
  balances: [],
  withdrawals: [],
  issues: [],
  loading: false,
  loaded: false,
};
// Lifecycle and stale-response handling live outside React and can be checked
// with deferred adapters. A disabled generation never publishes data to a new
// environment; failed sources retain their last known snapshot with a warning.
export class TransactionHistoryStore {
  private snapshot: HistorySnapshot = empty;
  private generation = 0;
  private enabled = false;
  private listeners = new Set<() => void>();
  constructor(private readonly port: TransactionHistoryPort) {}
  getSnapshot = (): HistorySnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(snapshot: HistorySnapshot) {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.generation++;
    if (!enabled) this.publish(empty);
  }
  async refresh(): Promise<void> {
    if (!this.enabled) return;
    const generation = ++this.generation;
    this.publish({ ...this.snapshot, loading: true });
    let batch: HistoryBatch;
    try {
      batch = await this.port.read();
    } catch {
      batch = {
        balances: {
          ok: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'El historial de saldos no está disponible.',
          },
        },
        withdrawals: {
          ok: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'El historial de retiros no está disponible.',
          },
        },
      };
    }
    if (!this.enabled || generation !== this.generation) return;
    const issues: { source: HistorySource; message: string }[] = [];
    for (const source of ['balances', 'withdrawals'] as const) {
      const result = batch[source];
      if (!result.ok) issues.push({ source, message: result.error.message });
    }
    this.publish({
      balances: batch.balances.ok ? batch.balances.value : this.snapshot.balances,
      withdrawals: batch.withdrawals.ok ? batch.withdrawals.value : this.snapshot.withdrawals,
      issues,
      loading: false,
      loaded: true,
    });
  }
}
