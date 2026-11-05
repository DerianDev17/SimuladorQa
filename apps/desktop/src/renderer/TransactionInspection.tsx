import { useId, useState, type ReactNode } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import { BalanceExecutionView } from './BalanceExecutionView';
import { TransactionMessageView } from './TransactionMessageView';
import { TransactionFlowView } from './TransactionFlowView';
import { TransactionDocumentation } from './TransactionDocumentation';
import type { InspectionMessage } from './transaction-inspection';
import type { DesktopClient } from './desktop-client';

const tabs = [
  ['flow', 'Flujo'],
  ['messages', 'Mensajes'],
  ['evidence', 'Evidencia'],
] as const;
type Tab = (typeof tabs)[number][0];
export function TransactionInspection({
  execution,
  snapshot,
  persisted,
  onReceipt,
  caseVerdict,
  empty,
  documentation,
  initialTab,
  messageAlternative,
  client,
  visible = true,
}: {
  execution: BalanceExecution | undefined;
  snapshot: AppSnapshot | undefined;
  persisted: boolean;
  onReceipt: (item: BalanceExecution) => void;
  caseVerdict?: ReactNode;
  empty: ReactNode;
  documentation: ReactNode;
  initialTab?: 'messages' | undefined;
  messageAlternative?: { label: string; open: () => void } | undefined;
  client?: DesktopClient | undefined;
  visible?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab ?? 'flow');
  const [message, setMessage] = useState<InspectionMessage>();
  const id = useId();
  return (
    <>
      {execution ? (
        <BalanceExecutionView execution={execution} onReceipt={onReceipt} compact />
      ) : (
        empty
      )}
      {caseVerdict}
      <div className="inspection-tabs" role="tablist" aria-label="Inspección de la transacción">
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            id={`${id}-${key}`}
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${id}-${key}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                tabs[
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (index + (event.key === 'ArrowLeft' ? tabs.length - 1 : 1)) % tabs.length
                ]![0];
              setTab(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-flow-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-flow`}
        hidden={tab !== 'flow'}
      >
        {execution ? (
          <TransactionFlowView
            execution={execution}
            persisted={persisted}
            onMessage={(value) => {
              setMessage(value);
              setTab('messages');
            }}
            onEvidence={() => setTab('evidence')}
          />
        ) : (
          <p className="inspection-empty">
            El flujo mostrará la evidencia de la operación que ejecutes o selecciones en el
            historial.
          </p>
        )}
      </div>
      <div
        id={`${id}-messages-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-messages`}
        hidden={tab !== 'messages'}
      >
        {execution ? (
          <TransactionMessageView
            execution={execution}
            selectedMessage={message}
            onSelectMessage={setMessage}
            messageAlternative={messageAlternative}
            client={client}
            visible={visible && tab === 'messages'}
          />
        ) : (
          <p className="inspection-empty">
            Selecciona una operación para consultar su solicitud y respuesta.
          </p>
        )}
      </div>
      <div
        id={`${id}-evidence-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-evidence`}
        hidden={tab !== 'evidence'}
      >
        {execution ? (
          <>
            <dl className="inspection-evidence">
              <div>
                <dt>Diario local</dt>
                <dd>
                  {persisted && execution.outcome !== 'STORAGE_ERROR'
                    ? 'Versión recuperada'
                    : 'Versión sin verificar'}
                </dd>
              </div>
              <div>
                <dt>Core / dispensación</dt>
                <dd>Sin verificar</dd>
              </div>
            </dl>
            <TransactionDocumentation
              operation={snapshot?.documentedOperations.find(
                (item) =>
                  item.transaction === (execution.withdrawal?.transaction ?? 'BALANCE') &&
                  item.account === 'SAVINGS',
              )}
              transaction={execution.withdrawal?.transaction ?? 'BALANCE'}
              original={false}
              captureEvidence={snapshot?.captureEvidence}
            />
          </>
        ) : (
          documentation
        )}
      </div>
    </>
  );
}
