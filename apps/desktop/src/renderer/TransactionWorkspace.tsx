import { useEffect, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import { caseMatchesDraft, evaluateCase } from '../../../../packages/domain/src/saved-cases';
import { parseDraftRequest } from '../../../../packages/domain/src/transaction-draft';
import { createWithdrawalReceipt } from '../../../../packages/domain/src/withdrawal-receipt';
import { CaseLibrary } from './CaseLibrary';
import { Icon } from './Icon';
import { TransactionComposer } from './TransactionComposer';
import { TransactionDocumentation } from './TransactionDocumentation';
import { TransactionError } from './TransactionError';
import { TransactionHistoryView } from './TransactionHistoryView';
import { TransactionInspection } from './TransactionInspection';
import { mergeExecutionHistory } from './transaction-inspection';
import { useTransactionHistory } from './useTransactionHistory';
import {
  useTransactionPreparation,
  type TransactionPreparationProps,
} from './useTransactionPreparation';
import { WithdrawalReceiptDialog } from './WithdrawalReceiptDialog';

export function TransactionWorkspace(props: TransactionPreparationProps) {
  const preparation = useTransactionPreparation(props);
  const {
    snapshot,
    balanceExecution,
    balanceRequestId,
    sessionExecutions,
    catalog,
    client,
    fieldsDisabled,
    loading,
    catalogError,
    draft,
    selectedAtm,
    selectedCase,
    caseRun,
    error,
    executingBalance,
    recoveringBalance,
    requestOperation,
    reviewHeading,
    receipt,
    discardDialog,
  } = preparation;
  const [focus, setFocus] = useState(false);
  const [selection, setSelection] = useState<{
    id: string;
    context: string;
    tab?: 'messages';
  }>();
  const context = `${snapshot?.environment}:${preparation.inspectionGeneration}`;
  useEffect(() => {
    if (balanceExecution?.requestId && balanceExecution.environment === snapshot?.environment)
      setSelection({ id: balanceExecution.requestId, context });
  }, [balanceExecution?.requestId, context, snapshot?.environment]);
  const history = useTransactionHistory(
    client,
    props.visible && snapshot?.environment === 'QA',
    balanceExecution
      ? [
          balanceExecution.requestId,
          balanceExecution.outcome,
          balanceExecution.finishedAt,
          balanceExecution.reversal?.outcome,
          balanceExecution.reversal?.finishedAt,
        ].join(':')
      : undefined,
  );
  const persisted = mergeExecutionHistory(history.balances, history.withdrawals);
  const records =
    snapshot?.environment === 'QA'
      ? mergeExecutionHistory(
          persisted,
          sessionExecutions,
          balanceExecution ? [balanceExecution] : [],
        )
      : [];
  const inspected = records.find(
    (item) =>
      item.requestId ===
      (selection?.context === context ? selection.id : balanceExecution?.requestId),
  );
  const latestMessages =
    records.find((item) => item.messages?.response) ?? records.find((item) => item.messages);
  const saved =
    !!inspected &&
    persisted.some(
      (item) =>
        item.requestId === inspected.requestId &&
        item.outcome === inspected.outcome &&
        item.finishedAt === inspected.finishedAt &&
        item.reversal?.outcome === inspected.reversal?.outcome &&
        item.reversal?.finishedAt === inspected.reversal?.finishedAt,
    );
  function onReceipt(execution: BalanceExecution) {
    const preview = createWithdrawalReceipt(execution);
    if (preview) preparation.setReceipt(preview);
  }
  function selectExecution(item: BalanceExecution, tab?: 'messages') {
    setSelection({ id: item.requestId, context, ...(tab ? { tab } : {}) });
    reviewHeading.current?.focus({ preventScroll: true });
    reviewHeading.current?.closest('.transaction-result-panel')?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }
  const verdict =
    inspected && caseRun?.requestId === inspected.requestId
      ? evaluateCase(caseRun.saved, inspected)
      : undefined;
  return (
    <div className="transaction-workspace interactive-transactions">
      <div className="transaction-heading">
        <div>
          <h1>Nueva transacción</h1>
          <p>Prepara una operación o explora su evidencia en el historial local.</p>
        </div>
        <div className="transaction-toolbar">
          <button
            className="secondary preparation-toggle"
            aria-expanded={!focus}
            aria-controls="transaction-preparation"
            onClick={() => setFocus(!focus)}
          >
            {focus ? 'Mostrar preparación' : 'Ocultar preparación'}
          </button>
          <CaseLibrary
            draft={draft}
            catalog={catalog}
            client={client}
            disabled={fieldsDisabled || loading || !!catalogError}
            canSave={!!selectedAtm && !!parseDraftRequest(draft)}
            onCatalogChange={preparation.onCatalogChange}
            onLoad={preparation.loadCase}
            onOpenChange={preparation.onCasesOpenChange}
          />
        </div>
      </div>
      {preparation.caseWarning && (
        <div className="document-note" role="status">
          {preparation.caseWarning}
        </div>
      )}
      {selectedCase && (
        <div className="document-note" role="status">
          Caso cargado: «{selectedCase.name}».{' '}
          {catalog?.cases.find((item) => item.id === selectedCase.id)?.revision !==
          selectedCase.revision
            ? 'El caso cambió; vuelve a cargarlo antes de ejecutar la prueba.'
            : draft && caseMatchesDraft(selectedCase, draft)
              ? selectedCase.expectation
                ? 'Su expectativa se evaluará tras una nueva respuesta correlacionada.'
                : 'Sin expectativa configurada; el resultado de prueba será inconcluso.'
              : 'El formulario cambió; esta ejecución no se asociará al caso.'}
        </div>
      )}
      <div
        className={`transaction-columns direct-transaction-columns inspection-columns${focus ? ' inspection-focus' : ''}`}
      >
        <div
          id="transaction-preparation"
          className="transaction-preparation-container"
          hidden={focus}
        >
          <TransactionComposer preparation={preparation} />
        </div>
        <section className="panel transaction-result-panel inspection-panel" aria-label="Resultado">
          <div className="panel-heading">
            <h2 ref={reviewHeading} tabIndex={-1}>
              Resultado
            </h2>
            {executingBalance && <span className="pill neutral">Operación en curso</span>}
          </div>
          {error?.target === 'review' && <TransactionError error={error} />}
          {preparation.canStartNewTransaction && !executingBalance && (
            <div className="recover-result">
              <p>
                {preparation.canStartNewBalance
                  ? 'El retiro anterior permanece por revisar en el historial. Puedes iniciar una consulta de saldo con una nueva lectura de tarjeta y PIN.'
                  : 'El intento anterior conserva su resultado en el historial. Puedes iniciar otra operación con una nueva lectura de tarjeta y PIN.'}
              </p>
              <button
                className="primary"
                disabled={fieldsDisabled || recoveringBalance}
                onClick={() => {
                  setFocus(false);
                  preparation.startNewTransaction();
                }}
              >
                {preparation.canStartNewBalance ? 'Nueva consulta de saldo' : 'Nueva transacción'}
              </button>
            </div>
          )}
          {balanceRequestId && !executingBalance && (
            <button
              className="secondary recover-result"
              disabled={recoveringBalance}
              onClick={() => void preparation.recoverBalance()}
            >
              Consultar resultado de {requestOperation === 'WITHDRAWAL' ? 'retiro' : 'saldo'}
            </button>
          )}
          {balanceRequestId && (
            <details className="inline-details result-reference">
              <summary>Referencia del intento actual</summary>
              <p className="technical-reference">Referencia de solicitud {balanceRequestId}</p>
            </details>
          )}
          <TransactionInspection
            key={inspected?.requestId ?? `empty-${snapshot?.environment}`}
            execution={inspected}
            snapshot={snapshot}
            persisted={saved}
            onReceipt={onReceipt}
            initialTab={selection?.context === context ? selection.tab : undefined}
            messageAlternative={
              latestMessages && !inspected?.messages
                ? {
                    label: `Abrir última operación con mensajes · STAN ${latestMessages.correlation?.stan ?? 'no disponible'}`,
                    open: () => selectExecution(latestMessages, 'messages'),
                  }
                : undefined
            }
            caseVerdict={
              verdict && caseRun ? (
                <section className="document-note" aria-label="Evaluación del caso">
                  <strong>
                    Prueba «{caseRun.saved.name}»: {verdict.status}
                  </strong>
                  <p>{verdict.reason}</p>
                  {caseRun.saved.expectation && (
                    <small>Fuente declarada: {caseRun.saved.expectation.source}</small>
                  )}
                  {verdict.checks.map((check) => (
                    <p key={check.field}>
                      {check.field}: esperado {check.expected} · recibido {check.actual}{' '}
                      {check.pass ? '✓' : '✕'}
                    </p>
                  ))}
                </section>
              ) : undefined
            }
            empty={
              <div className="result-empty" role="status">
                <Icon name={executingBalance || balanceRequestId ? 'clock' : 'file'} size={30} />
                <h3>
                  {executingBalance
                    ? 'Esperando respuesta'
                    : balanceRequestId
                      ? 'Resultado por confirmar'
                      : 'Aún no hay resultado'}
                </h3>
                <p>
                  {executingBalance
                    ? 'La transacción está en curso. Conserva esta ventana abierta.'
                    : balanceRequestId
                      ? 'Recupera el resultado del intento antes de volver a enviar.'
                      : 'Ejecuta una operación o selecciona una del historial.'}
                </p>
              </div>
            }
            documentation={
              <TransactionDocumentation
                operation={preparation.operation}
                transaction={preparation.transaction}
                original={preparation.original}
                captureEvidence={snapshot?.captureEvidence}
              />
            }
          />
        </section>
      </div>
      {snapshot?.environment === 'QA' ? (
        <TransactionHistoryView
          key={snapshot.environment}
          items={records}
          selectedId={inspected?.requestId}
          catalog={catalog}
          history={history}
          onRefresh={() => void history.refresh()}
          onSelect={selectExecution}
        />
      ) : (
        <p className="form-note">
          El historial local de ejecución está disponible en QA. La observación de Mediator se
          consulta por separado.
        </p>
      )}
      {receipt && (
        <WithdrawalReceiptDialog
          key={receipt.requestId}
          receipt={receipt}
          client={client}
          onClose={() => preparation.setReceipt(undefined)}
        />
      )}
      <dialog
        ref={discardDialog}
        className="catalog-dialog discard-draft-dialog"
        aria-labelledby="discard-draft-title"
        onCancel={(event) => {
          event.preventDefault();
          preparation.closeDiscard();
        }}
      >
        <h2 id="discard-draft-title">¿Limpiar este borrador?</h2>
        <p>Se quitarán los datos y la tarjeta de esta sesión. Los casos guardados se conservan.</p>
        <div className="catalog-actions">
          <button autoFocus onClick={preparation.closeDiscard}>
            Conservar borrador
          </button>
          <button
            className="danger"
            onClick={() => {
              preparation.closeDiscard();
              preparation.reset();
            }}
          >
            Confirmar limpieza
          </button>
        </div>
      </dialog>
    </div>
  );
}
