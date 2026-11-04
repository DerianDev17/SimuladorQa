import { balanceDeliveryUncertain } from '../../../../packages/domain/src/balance-inquiry';
import { caseMatchesDraft, evaluateCase } from '../../../../packages/domain/src/saved-cases';
import { parseDraftRequest } from '../../../../packages/domain/src/transaction-draft';
import { createWithdrawalReceipt } from '../../../../packages/domain/src/withdrawal-receipt';
import { BalanceExecutionView, executionOutcomeLabel } from './BalanceExecutionView';
import { CaseLibrary } from './CaseLibrary';
import { Icon } from './Icon';
import { TransactionComposer } from './TransactionComposer';
import { TransactionDocumentation } from './TransactionDocumentation';
import { TransactionError } from './TransactionError';
import { TransactionMessageView } from './TransactionMessageView';
import {
  useTransactionPreparation,
  type TransactionPreparationProps,
} from './useTransactionPreparation';
import { WithdrawalReceiptDialog } from './WithdrawalReceiptDialog';
export function TransactionWorkspace(props: TransactionPreparationProps) {
  const preparation = useTransactionPreparation(props);
  const {
    monetary,
    draft,
    catalog,
    client,
    fieldsDisabled,
    loading,
    catalogError,
    selectedAtm,
    onCatalogChange,
    loadCase,
    onCasesOpenChange,
    caseWarning,
    selectedCase,
    balanceExecution,
    reviewHeading,
    executingBalance,
    balanceRequestId,
    error,
    canStartNewTransaction,
    canStartNewBalance,
    recoveringBalance,
    startNewTransaction,
    setReceipt,
    caseRun,
    recoverBalance,
    requestOperation,
    onNavigate,
    sessionExecutions,
    snapshot,
    historyAtmId,
    setHistoryAtmId,
    loadBalanceHistory,
    atmHistory,
    receipt,
    discardDialog,
    closeDiscard,
    reset,
  } = preparation;
  return (
    <div className="transaction-workspace">
      <div className="transaction-heading">
        <div>
          <h1>Nueva transacción</h1>
          <p>
            {monetary
              ? 'Prepara el retiro, revisa los importes y elige tu comprobante.'
              : 'Configura la operación y consulta la respuesta del host.'}
          </p>
        </div>
        <div className="transaction-toolbar">
          <CaseLibrary
            draft={draft}
            catalog={catalog}
            client={client}
            disabled={fieldsDisabled || loading || !!catalogError}
            canSave={!!selectedAtm && !!parseDraftRequest(draft)}
            onCatalogChange={onCatalogChange}
            onLoad={loadCase}
            onOpenChange={onCasesOpenChange}
          />
        </div>
      </div>
      {caseWarning && (
        <div className="document-note" role="status">
          {caseWarning}
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
        className={`transaction-columns direct-transaction-columns${balanceExecution ? ' with-message-inspector' : ''}`}
      >
        <TransactionComposer preparation={preparation} />
        <section className="panel transaction-result-panel" aria-label="Resultado">
          <div className="panel-heading">
            <h2 ref={reviewHeading} tabIndex={-1}>
              Resultado
            </h2>
            <span
              className={`pill ${balanceExecution?.outcome === 'APPROVED' && !balanceDeliveryUncertain(balanceExecution) ? 'result-success-pill' : 'neutral'}`}
            >
              {executingBalance
                ? 'En curso'
                : balanceExecution
                  ? balanceExecution.outcome === 'APPROVED' &&
                    !balanceDeliveryUncertain(balanceExecution)
                    ? balanceExecution.reversal
                      ? 'Flujo completo'
                      : 'Aprobado'
                    : 'Intento registrado'
                  : balanceRequestId
                    ? 'Por confirmar'
                    : 'Sin ejecutar'}
            </span>
          </div>
          {error?.target === 'review' && <TransactionError error={error} />}
          {canStartNewTransaction && !executingBalance && (
            <div className="recover-result">
              <p>
                {canStartNewBalance
                  ? 'El retiro anterior permanece por revisar en el historial. Puedes iniciar una consulta de saldo con una nueva lectura de tarjeta y PIN.'
                  : 'El intento anterior conserva su resultado en el historial. Puedes iniciar otra operación con una nueva lectura de tarjeta y PIN.'}
              </p>
              <button
                className="primary"
                disabled={fieldsDisabled || recoveringBalance}
                onClick={startNewTransaction}
              >
                {canStartNewBalance ? 'Nueva consulta de saldo' : 'Nueva transacción'}
              </button>
            </div>
          )}
          {balanceExecution ? (
            <>
              <BalanceExecutionView
                execution={balanceExecution}
                onReceipt={(execution) => {
                  const preview = createWithdrawalReceipt(execution);
                  if (preview) setReceipt(preview);
                }}
              />
              {caseRun?.requestId === balanceExecution.requestId &&
                (() => {
                  const verdict = evaluateCase(caseRun.saved, balanceExecution);
                  return (
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
                  );
                })()}
            </>
          ) : (
            <>
              <div className="result-empty" role="status">
                <Icon name={executingBalance || balanceRequestId ? 'clock' : 'file'} size={48} />
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
                      : 'La respuesta aparecerá aquí después del envío.'}
                </p>
              </div>
              <dl className="result-metadata">
                {['Respuesta', 'Tiempo', 'STAN', 'RRN'].map((label) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>—</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {balanceRequestId && !executingBalance && (
            <button
              className="secondary recover-result"
              disabled={recoveringBalance}
              onClick={() => void recoverBalance()}
            >
              Consultar resultado de {requestOperation === 'WITHDRAWAL' ? 'retiro' : 'saldo'}
            </button>
          )}
          {balanceRequestId && (
            <details className="inline-details result-reference">
              <summary>Ver detalle técnico</summary>
              <p className="technical-reference">Referencia de solicitud {balanceRequestId}</p>
            </details>
          )}
        </section>
        {balanceExecution && (
          <TransactionMessageView key={balanceExecution.requestId} execution={balanceExecution} />
        )}
      </div>
      <section className="panel session-activity" aria-label="Actividad de esta sesión">
        <div className="panel-heading">
          <h2>Actividad de esta sesión</h2>
          <button className="text-button" onClick={() => onNavigate('history')}>
            Ver historial <Icon name="arrow" size={14} />
          </button>
        </div>
        <div className="activity-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Operación</th>
                <th>ATM</th>
                <th>Estado</th>
                <th>Tiempo</th>
              </tr>
            </thead>
            <tbody>
              {sessionExecutions.length ? (
                sessionExecutions.map((item) => (
                  <tr key={item.requestId}>
                    <td>{new Date(item.startedAt).toLocaleTimeString('es-EC')}</td>
                    <td>
                      {item.withdrawal
                        ? `Retiro · USD ${item.withdrawal.amount}`
                        : 'Consulta de saldo'}
                    </td>
                    <td>
                      {item.correlation?.terminalId ??
                        catalog?.atms.find((atm) => atm.id === item.atmId)?.alias ??
                        'ATM no disponible'}
                    </td>
                    <td>
                      <span>{executionOutcomeLabel(item)}</span>
                    </td>
                    <td>{item.elapsedMs} ms</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="session-empty">
                    <Icon name="clock" size={19} /> No se han enviado transacciones en esta sesión.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {snapshot?.environment === 'QA' && (
        <details className="section-details balance-history-details">
          <summary>Historial de transacciones QA</summary>
          <label>
            ATM del historial
            <select value={historyAtmId} onChange={(event) => setHistoryAtmId(event.target.value)}>
              <option value="">Todos los ATM</option>
              {catalog?.atms.map((atm) => (
                <option key={atm.id} value={atm.id}>
                  {atm.alias} · {atm.terminalId}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            disabled={fieldsDisabled}
            onClick={() => void loadBalanceHistory()}
          >
            Actualizar historial
          </button>
          {atmHistory &&
            (atmHistory.length ? (
              atmHistory.map((execution) => (
                <BalanceExecutionView
                  key={execution.requestId}
                  execution={execution}
                  onReceipt={(item) => {
                    const preview = createWithdrawalReceipt(item);
                    if (preview) setReceipt(preview);
                  }}
                />
              ))
            ) : (
              <p>No hay transacciones registradas para este ATM en el historial disponible.</p>
            ))}
        </details>
      )}
      {receipt && (
        <WithdrawalReceiptDialog
          key={receipt.requestId}
          receipt={receipt}
          client={client}
          onClose={() => setReceipt(undefined)}
        />
      )}
      <details
        className="section-details transaction-execution-details"
        hidden={!!balanceExecution}
      >
        <summary>
          Flujo e inspector <span>Vista documental</span>
        </summary>
        <div className="execution-details-grid">
          <section className="panel transaction-flow" aria-labelledby="transaction-flow-title">
            <div className="panel-heading">
              <h2 id="transaction-flow-title">Flujo de transacción</h2>
              <span className="pill neutral">Sin ejecución</span>
            </div>
            <ol className="transaction-route">
              {[
                {
                  icon: 'atm' as const,
                  title: 'ATM Simulator',
                  text: selectedAtm ? 'Perfil en borrador, sin envío' : 'Selecciona un perfil ATM',
                },
                {
                  icon: 'monitor' as const,
                  title: 'Switch Coonecta (SmartVista)',
                  text: 'Conexión sin configurar',
                },
                { icon: 'database' as const, title: 'Core', text: 'Observador sin configurar' },
                {
                  icon: 'transaction' as const,
                  title: 'Respuesta del Switch',
                  text: 'Sin mensaje recibido',
                },
              ].map((step) => (
                <li key={step.title}>
                  <span className="route-icon">
                    <Icon name={step.icon} size={21} />
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </div>
                  <span className="route-time">—</span>
                </li>
              ))}
            </ol>
            <div className="transaction-result-placeholder">
              <Icon name="clock" size={23} />
              <div>
                <strong>Resultado pendiente</strong>
              </div>
            </div>
            <dl className="transaction-result-values">
              <div>
                <dt>Código de respuesta</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Monto ejecutado</dt>
                <dd>—</dd>
              </div>
            </dl>
          </section>
          <section
            className="panel transaction-inspector"
            aria-labelledby="transaction-inspector-title"
          >
            <div className="panel-heading">
              <h2 id="transaction-inspector-title">Mensaje ISO8583</h2>
              <label className="inspector-view-picker">
                <span className="visually-hidden">Vista del mensaje</span>
                <select aria-label="Vista del mensaje" disabled>
                  <option>Vista: Campos</option>
                </select>
              </label>
            </div>
            <div className="inspector-tabs" role="tablist" aria-label="Vistas de evidencia">
              <button role="tab" aria-selected="false" disabled>
                Solicitud
              </button>
              <button role="tab" aria-selected="false" disabled>
                Respuesta
              </button>
              <button role="tab" aria-selected="false" disabled>
                RAW
              </button>
              <button role="tab" aria-selected="false" disabled>
                HEX
              </button>
            </div>
            <table className="inspector-table" aria-label="Campos del mensaje">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Descripción</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state compact">
                      <Icon name="transaction" size={32} />
                      <h3>Esperando una ejecución</h3>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="inspector-footnote">
              <Icon name="shield" size={14} /> Sin mensaje · datos sensibles protegidos
            </p>
          </section>{' '}
        </div>
      </details>
      <TransactionDocumentation preparation={preparation} />
      <dialog
        ref={discardDialog}
        className="catalog-dialog discard-draft-dialog"
        aria-labelledby="discard-draft-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDiscard();
        }}
      >
        <h2 id="discard-draft-title">¿Limpiar este borrador?</h2>
        <p>Se quitarán los datos y la tarjeta de esta sesión. Los casos guardados se conservan.</p>
        <div className="catalog-actions">
          <button autoFocus onClick={closeDiscard}>
            Conservar borrador
          </button>
          <button
            className="danger"
            onClick={() => {
              closeDiscard();
              reset();
            }}
          >
            Confirmar limpieza
          </button>
        </div>
      </dialog>
    </div>
  );
}
