import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { DesktopClient } from './desktop-client';
import { desktopTransactionHistory, TransactionHistoryStore } from './transaction-history';

export function useTransactionHistory(
  client: DesktopClient,
  enabled: boolean,
  revision: string | undefined,
) {
  const store = useMemo(
    () => new TransactionHistoryStore(desktopTransactionHistory(client)),
    [client],
  );
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot);
  useEffect(() => {
    store.setEnabled(enabled);
    return () => store.setEnabled(false);
  }, [store, enabled]);
  useEffect(() => {
    if (enabled) void store.refresh();
  }, [store, enabled, revision]);
  return { ...snapshot, refresh: () => store.refresh() };
}
