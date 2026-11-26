import { useRef, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { SessionMessages } from '../../../../packages/shared/src/session-messages';
import type { DesktopClient } from './desktop-client';
import { useSessionMessages } from './useSessionMessages';
import { mergeExecutionHistory } from './transaction-inspection';
import {
  ComparisonTransactionCard,
  ComparisonTransactionPicker,
} from './ComparisonTransactionPicker';
import { ComparisonMessageTable, type ComparisonSlot } from './ComparisonMessageTable';
import { ComparisonHelp } from './ComparisonHelp';

export function TransactionComparison({
  execution,
  candidates,
  client,
  complete,
  currentSession,
}: {
  execution: BalanceExecution;
  candidates: readonly BalanceExecution[];
  client: DesktopClient | undefined;
  complete: boolean;
  currentSession: SessionMessages | undefined;
}) {
  const [reference, setReference] = useState<BalanceExecution>();
  const [chosenCurrent, setChosenCurrent] = useState<BalanceExecution>();
  const [picker, setPicker] = useState<'A' | 'B'>();
  const cards = useRef<HTMLDivElement>(null);
  const records = mergeExecutionHistory(
    reference ? [reference] : [],
    chosenCurrent ? [chosenCurrent] : [],
    candidates,
    [execution],
  );
  const current =
    records.find((item) => item.requestId === (chosenCurrent?.requestId ?? execution.requestId)) ??
    execution;
  const selectedReference = records.find((item) => item.requestId === reference?.requestId);
  function closePicker(side: 'A' | 'B') {
    setPicker(undefined);
    requestAnimationFrame(() =>
      cards.current?.querySelector<HTMLButtonElement>(`.side-${side} button`)?.focus(),
    );
  }
  return (
    <section className="transaction-comparison" aria-label="Comparador de transacciones">
      <div className="comparison-intro">
        <span className="eyebrow">COMPARADOR ISO8583</span>
        <h3>Dos transacciones. Cada campo, lado a lado.</h3>
        <p>
          1. Elige A como referencia. 2. Elige B para revisar. 3. Abre el mensaje y recorre las
          diferencias.
        </p>
      </div>
      <details className="comparison-guide">
        <summary>Cómo elegir las transacciones y leer las diferencias</summary>
        <ComparisonHelp />
      </details>
      <div className="comparison-pair" ref={cards}>
        <ComparisonTransactionCard
          side="A"
          item={selectedReference}
          onChoose={() => setPicker('A')}
        />
        <ComparisonTransactionCard side="B" item={current} onChoose={() => setPicker('B')} />
      </div>
      <div className="comparison-actions">
        <button
          className="secondary"
          disabled={!selectedReference}
          onClick={() => {
            setReference(current);
            setChosenCurrent(selectedReference);
          }}
        >
          Intercambiar A y B
        </button>
        {selectedReference && (
          <button className="text-button" onClick={() => setReference(undefined)}>
            Quitar referencia
          </button>
        )}
      </div>
      {picker && (
        <ComparisonTransactionPicker
          key={picker}
          side={picker}
          candidates={records}
          client={client}
          excludedId={picker === 'A' ? current.requestId : selectedReference?.requestId}
          onSelect={(item) => {
            if (picker === 'A') setReference(item);
            else setChosenCurrent(item);
            closePicker(picker);
          }}
          onClose={() => closePicker(picker)}
        />
      )}
      {selectedReference ? (
        <ComparisonDetails
          key={`${selectedReference.requestId}:${current.requestId}`}
          reference={selectedReference}
          current={current}
          client={client}
          complete={complete}
          useOpenedSession={current.requestId === execution.requestId}
          openedSession={currentSession}
        />
      ) : (
        <div className="comparison-empty">
          <strong>Empieza eligiendo la transacción A</strong>
          <p>
            B ya contiene la operación abierta. Puedes cambiar ambas desde sus tarjetas, sin
            reenviar ninguna transacción.
          </p>
        </div>
      )}
    </section>
  );
}
function ComparisonDetails({
  reference,
  current,
  client,
  complete,
  useOpenedSession,
  openedSession,
}: {
  reference: BalanceExecution;
  current: BalanceExecution;
  client: DesktopClient | undefined;
  complete: boolean;
  useOpenedSession: boolean;
  openedSession: SessionMessages | undefined;
}) {
  const a = useSessionMessages(client, reference, complete);
  const b = useSessionMessages(client, current, complete && !useOpenedSession);
  const currentSession = useOpenedSession ? openedSession : b.value;
  const definitions = [
    ['request', 'Solicitud', reference.messages?.request, current.messages?.request],
    ['response', 'Respuesta', reference.messages?.response, current.messages?.response],
    ...(reference.reversal || current.reversal
      ? ([
          [
            'reversal-request',
            'Reverso',
            reference.reversal?.messages?.request,
            current.reversal?.messages?.request,
          ],
          [
            'reversal-response',
            'Respuesta de reverso',
            reference.reversal?.messages?.response,
            current.reversal?.messages?.response,
          ],
        ] as const)
      : []),
  ] as const;
  const slots: ComparisonSlot[] = definitions.map(([id, title, left, right]) => {
    const fullLeft = complete && left ? a.value?.messages[left.mti] : undefined;
    const fullRight = complete && right ? currentSession?.messages[right.mti] : undefined;
    return {
      id,
      title,
      reference: fullLeft ?? left,
      current: fullRight ?? right,
      referenceComplete: !!fullLeft,
      currentComplete: !!fullRight,
    };
  });
  return (
    <>
      {complete && (
        <div className="comparison-source-status">
          <p role="status">
            A:{' '}
            {a.loading
              ? 'Consultando mensajes…'
              : (a.error ??
                (a.value
                  ? 'Valores completos disponibles.'
                  : 'Original completo no disponible; versión protegida.'))}{' '}
            <button className="text-button" onClick={a.refresh}>
              Actualizar referencia
            </button>
          </p>
          {!useOpenedSession && (
            <p role="status">
              B:{' '}
              {b.loading
                ? 'Consultando mensajes…'
                : (b.error ??
                  (b.value
                    ? 'Valores completos disponibles.'
                    : 'Original completo no disponible; versión protegida.'))}{' '}
              <button className="text-button" onClick={b.refresh}>
                Actualizar transacción B
              </button>
            </p>
          )}
        </div>
      )}
      <ComparisonMessageTable slots={slots} />
      <p className="comparison-footnote">
        Comparación literal de evidencia guardada. STAN y RRN son identificadores variables. Las
        diferencias no certifican aprobación, débito ni dispensación.
      </p>
    </>
  );
}
