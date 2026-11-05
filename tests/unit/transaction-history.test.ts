import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TransactionHistoryStore,
  desktopTransactionHistory,
  type HistoryBatch,
} from '../../apps/desktop/src/renderer/transaction-history';
import { DesktopClient } from '../../apps/desktop/src/renderer/desktop-client';
import type { DesktopApi } from '../../packages/shared/src/contracts';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function batch(): HistoryBatch {
  return {
    balances: { ok: true, value: [] },
    withdrawals: { ok: true, value: [approvedWithdrawalExecution()] },
  };
}
afterEach(() => vi.useRealTimers());
describe('adaptador del historial y ciclo de vida', () => {
  it('no consulta deshabilitado y descarta respuestas después de cambiar ambiente', async () => {
    const pending = deferred<HistoryBatch>();
    const read = vi.fn(() => pending.promise);
    const store = new TransactionHistoryStore({ read });
    await store.refresh();
    expect(read).not.toHaveBeenCalled();
    store.setEnabled(true);
    const loading = store.refresh();
    expect(store.getSnapshot().loading).toBe(true);
    store.setEnabled(false);
    pending.resolve(batch());
    await loading;
    expect(store.getSnapshot()).toMatchObject({
      loaded: false,
      loading: false,
      balances: [],
      withdrawals: [],
    });
  });
  it('solo publica la consulta más reciente aunque otra termine después', async () => {
    const first = deferred<HistoryBatch>();
    const second = deferred<HistoryBatch>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const store = new TransactionHistoryStore({ read });
    store.setEnabled(true);
    const a = store.refresh();
    const b = store.refresh();
    const latest = batch();
    second.resolve(latest);
    await b;
    first.resolve(batch());
    await a;
    expect(store.getSnapshot().withdrawals).toBe(
      latest.withdrawals.ok ? latest.withdrawals.value : undefined,
    );
  });
  it('conserva la última fuente disponible y advierte de una respuesta parcial', async () => {
    const initial = batch();
    const balance = approvedWithdrawalExecution();
    delete balance.withdrawal;
    initial.balances = { ok: true, value: [balance] };
    const read = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce({
        balances: { ok: false, error: { code: 'TIMEOUT', message: 'Plazo agotado' } },
        withdrawals: { ok: true, value: [] },
      });
    const store = new TransactionHistoryStore({ read });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.setEnabled(true);
    await store.refresh();
    await store.refresh();
    expect(store.getSnapshot()).toMatchObject({
      balances: [balance],
      withdrawals: [],
      loaded: true,
      loading: false,
      issues: [{ source: 'balances', message: 'Plazo agotado' }],
    });
    unsubscribe();
    listener.mockClear();
    store.setEnabled(false);
    expect(listener).not.toHaveBeenCalled();
  });
  it('normaliza una dependencia no disponible sin rechazos sin manejar', async () => {
    const store = new TransactionHistoryStore({
      read: async () => {
        throw Error('private-detail');
      },
    });
    store.setEnabled(true);
    await store.refresh();
    expect(store.getSnapshot().issues).toHaveLength(2);
    expect(JSON.stringify(store.getSnapshot())).not.toContain('private-detail');
  });
  it('limita el plazo IPC por fuente y conserva el retiro aunque saldo no responda', async () => {
    vi.useFakeTimers();
    const records = [approvedWithdrawalExecution()];
    const api = {
      getBalanceHistory: () => new Promise(() => {}),
      getWithdrawalHistory: async () => ({ ok: true, value: records }),
    } as unknown as DesktopApi;
    const store = new TransactionHistoryStore(
      desktopTransactionHistory(new DesktopClient(api, 20)),
    );
    store.setEnabled(true);
    const pending = store.refresh();
    await vi.advanceTimersByTimeAsync(21);
    await pending;
    expect(store.getSnapshot().withdrawals).toEqual(records);
    expect(store.getSnapshot().issues).toHaveLength(1);
    expect(store.getSnapshot().issues[0]?.source).toBe('balances');
  });
});
