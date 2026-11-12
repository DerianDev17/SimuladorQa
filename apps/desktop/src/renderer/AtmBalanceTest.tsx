import { useCallback, useEffect, useState } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import {
  balanceResponseConfirmed,
  balanceNotTransmitted,
} from '../../../../packages/domain/src/balance-inquiry';
import {
  useTransactionPreparation,
  type TransactionPreparationProps,
} from './useTransactionPreparation';
import type { AtmSelection } from './transaction-setup';
import { CardReaderView } from './CardReaderView';
import { BalanceExecutionView } from './BalanceExecutionView';
import { TransactionError } from './TransactionError';

export function AtmBalanceTest({
  atm,
  entityId,
  entityRevision,
  ...props
}: Omit<TransactionPreparationProps, 'pendingAtmSelection' | 'onAtmSelectionApplied'> & {
  atm: AtmProfile;
  entityId: string;
  entityRevision: number;
}) {
  const [selection, setSelection] = useState<AtmSelection | undefined>({
    environment: 'QA',
    id: atm.id,
    revision: atm.revision,
  });
  const applied = useCallback(() => setSelection(undefined), []);
  const preparation = useTransactionPreparation({
    ...props,
    pendingAtmSelection: selection,
    onAtmSelectionApplied: applied,
    qaAtmBalanceTest: { entityId, entityRevision },
  });
  const [history, setHistory] = useState<BalanceExecution>();
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [acceptedPrevious, setAcceptedPrevious] = useState(false);
  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    setHistoryError('');
    void props.client
      .call((api) => api.getBalanceHistory('QA'))
      .then((result) => {
        if (!active) return;
        if (result.ok)
          setHistory(
            [...result.value]
              .filter((item) => item.atmId === atm.id)
              .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0],
          );
        else setHistoryError(result.error.message);
        setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [props.client, atm.id, historyVersion]);
  const result = preparation.balanceExecution;
  const previousUncertain =
    !!history && !balanceResponseConfirmed(history) && !balanceNotTransmitted(history);
  const previousPending = history?.outcome === 'PENDING' || (!!history && !history.finishedAt);
  const differentRevision =
    result && (result.atmRevision !== atm.revision || result.atmId !== atm.id);
  const sendBlocked =
    preparation.fieldsDisabled ||
    !preparation.balanceContext ||
    !!preparation.balanceRequestId ||
    preparation.checkingBalance ||
    !preparation.balanceReadiness?.ready ||
    historyLoading ||
    !!historyError ||
    previousPending ||
    (previousUncertain && !acceptedPrevious);
  return (
    <section className="atm-balance-test" aria-label="Prueba guiada de saldo">
      <h3>3. Prueba guiada de saldo</h3>
      <p>
        <strong>
          {atm.alias} · {atm.terminalId}
        </strong>{' '}
        · Qa / Local / Ahorros
      </p>
      <ol>
        <li>Inserta la tarjeta QA por contacto y pulsa Leer tarjeta.</li>
        <li>Pulsa Probar consulta de saldo e ingresa el PIN en la ventana protegida.</li>
        <li>
          Revisa la respuesta y su referencia. La prueba consume una secuencia del pool compartido.
        </li>
      </ol>
      {historyLoading && <p role="status">Consultando pruebas anteriores…</p>}
      {historyError && <p role="alert">{historyError}</p>}
      {(historyError || previousPending) && (
        <button
          disabled={preparation.fieldsDisabled || historyLoading}
          onClick={() => setHistoryVersion((value) => value + 1)}
        >
          Actualizar prueba anterior
        </button>
      )}
      {history && !result && (
        <details className="inline-details" open={previousUncertain}>
          <summary>Última consulta registrada para este ATM</summary>
          <p>
            Referencia histórica; corresponde a la revisión {history.atmRevision}. No certifica la
            configuración actual.
          </p>
          <BalanceExecutionView execution={history} compact />
        </details>
      )}
      {previousPending && (
        <p role="status">
          La consulta anterior sigue pendiente. Actualiza su resultado antes de iniciar otra.
        </p>
      )}
      {previousUncertain && !previousPending && !acceptedPrevious && (
        <button onClick={() => setAcceptedPrevious(true)} disabled={preparation.fieldsDisabled}>
          Preparar una nueva prueba conservando el resultado incierto
        </button>
      )}
      {props.visible && (
        <CardReaderView
          transaction
          environment="QA"
          disabled={preparation.fieldsDisabled || !!preparation.balanceRequestId}
          selectedReadId={preparation.selectedCard?.readId}
          onUseCard={preparation.chooseCard}
          onClearCard={preparation.clearCard}
          onAvailableCardChange={preparation.onCardAvailable}
          onReadingChange={preparation.onCardReading}
        />
      )}
      {preparation.checkingBalance && (
        <p role="status">Comprobando tarjeta y requisitos de envío…</p>
      )}
      {preparation.balanceReadiness?.blockers.length ? (
        <ul role="status">
          {preparation.balanceReadiness.blockers.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
      ) : null}
      <TransactionError error={preparation.error} />
      <button
        className="primary"
        disabled={sendBlocked}
        onClick={() => void preparation.executeBalance()}
      >
        {preparation.executingBalance ? 'Consultando saldo…' : 'Probar consulta de saldo'}
      </button>
      <p className="form-note" role="status">
        {preparation.sendHint}
      </p>
      {preparation.balanceRequestId && (
        <div role="status">
          <p>
            Referencia de consulta: {preparation.balanceRequestId}. El mismo intento no se reenvía.
          </p>
          <button
            disabled={preparation.executingBalance || preparation.recoveringBalance}
            onClick={() => void preparation.recoverBalance()}
          >
            Consultar resultado de saldo
          </button>
        </div>
      )}
      {result && (
        <div aria-label="Resultado de prueba ATM">
          <h3>
            {!differentRevision && result.outcome === 'APPROVED'
              ? 'Consulta de saldo aprobada'
              : 'Resultado de la consulta de saldo'}
          </h3>
          {differentRevision && (
            <p>
              El perfil cambió después de esta prueba. El resultado pertenece a la revisión{' '}
              {result.atmRevision}.
            </p>
          )}
          <BalanceExecutionView execution={result} />
          <p className="form-note">
            Esta evidencia corresponde a saldo y a la configuración utilizada en esa consulta.
          </p>
        </div>
      )}
    </section>
  );
}
