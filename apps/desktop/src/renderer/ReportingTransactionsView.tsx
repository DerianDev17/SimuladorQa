import { useRef, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import {
  createWithdrawalReceipt,
  type WithdrawalReceipt,
} from '../../../../packages/domain/src/withdrawal-receipt';
import type { DesktopClient } from './desktop-client';
import type { useTransactionHistory } from './useTransactionHistory';
import { mergeExecutionHistory } from './transaction-inspection';
import { TransactionHistoryView } from './TransactionHistoryView';
import { TransactionInspection } from './TransactionInspection';
import { WithdrawalReceiptDialog } from './WithdrawalReceiptDialog';

export function ReportingTransactionsView({
  history,
  catalog,
  snapshot,
  client,
  sessionExecutions,
}: {
  history: ReturnType<typeof useTransactionHistory>;
  catalog: CatalogSnapshot | undefined;
  snapshot: AppSnapshot | undefined;
  client: DesktopClient;
  sessionExecutions: readonly BalanceExecution[];
}) {
  const [selection, setSelection] = useState<{
    id: string;
    tab?: 'messages';
    archived?: BalanceExecution;
  }>();
  const [receipt, setReceipt] = useState<WithdrawalReceipt>();
  const detail = useRef<HTMLElement>(null);
  const persisted = mergeExecutionHistory(
    history.balances,
    history.withdrawals,
    history.deposits,
    selection?.archived ? [selection.archived] : [],
  );
  const items = mergeExecutionHistory(persisted, sessionExecutions);
  const execution = items.find((item) => item.requestId === selection?.id);
  const latestMessages =
    items.find((item) => item.messages?.response) ?? items.find((item) => item.messages);
  function selectExecution(item: BalanceExecution, archived = false, tab?: 'messages') {
    setSelection((current) => ({
      id: item.requestId,
      ...(tab ? { tab } : {}),
      ...(archived || current?.archived?.requestId === item.requestId ? { archived: item } : {}),
    }));
    requestAnimationFrame(() => {
      detail.current?.focus();
      detail.current?.scrollIntoView({ block: 'start' });
    });
  }
  return (
    <>
      <TransactionHistoryView
        client={client}
        onSelectArchived={(item) => selectExecution(item, true)}
        items={items}
        history={history}
        catalog={catalog}
        selectedId={selection?.id}
        onRefresh={() => void history.refresh()}
        onSelect={(item) => selectExecution(item)}
      />
      {execution && (
        <section
          ref={detail}
          tabIndex={-1}
          className="panel inspection-panel reporting-transaction-detail"
          aria-label="Detalle de transacción guardada"
        >
          <div className="panel-heading">
            <h2>Detalle de transacción</h2>
            <button onClick={() => setSelection(undefined)}>Cerrar detalle</button>
          </div>
          <TransactionInspection
            key={execution.requestId}
            execution={execution}
            comparisonCandidates={items}
            snapshot={snapshot}
            persisted={
              !history.issues.length &&
              persisted.some(
                (item) =>
                  item.requestId === execution.requestId &&
                  item.outcome === execution.outcome &&
                  item.finishedAt === execution.finishedAt &&
                  item.reversal?.outcome === execution.reversal?.outcome &&
                  item.reversal?.finishedAt === execution.reversal?.finishedAt,
              )
            }
            initialTab={selection?.tab}
            messageAlternative={
              latestMessages && !execution.messages
                ? {
                    label: `Abrir última operación con mensajes · STAN ${latestMessages.correlation?.stan ?? 'no disponible'}`,
                    open: () => selectExecution(latestMessages, false, 'messages'),
                  }
                : undefined
            }
            client={client}
            onReceipt={(item) => setReceipt(createWithdrawalReceipt(item) ?? undefined)}
            empty={null}
            documentation={null}
          />
        </section>
      )}
      {receipt && (
        <WithdrawalReceiptDialog
          receipt={receipt}
          client={client}
          onClose={() => setReceipt(undefined)}
        />
      )}
    </>
  );
}
