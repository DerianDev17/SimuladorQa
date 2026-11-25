import { useId, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import {
  compareIsoMessages,
  type ComparisonStatus,
} from '../../../../packages/domain/src/iso-message-comparison';
import type { SessionMessages } from '../../../../packages/shared/src/session-messages';
import type { DesktopClient } from './desktop-client';
import { useSessionMessages } from './useSessionMessages';

const statusLabels: Record<ComparisonStatus, string> = {
  equal: 'Igual',
  changed: 'Diferente',
  added: 'Añadido',
  removed: 'Ausente',
  unverifiable: 'No verificable',
};
const slots = [
  ['request', 'Solicitud'],
  ['response', 'Respuesta'],
  ['reversalRequest', 'Solicitud de reverso'],
  ['reversalResponse', 'Respuesta de reverso'],
] as const;
function messages(execution: BalanceExecution) {
  return {
    request: execution.messages?.request,
    response: execution.messages?.response,
    reversalRequest: execution.reversal?.messages?.request,
    reversalResponse: execution.reversal?.messages?.response,
  };
}
function operation(execution: BalanceExecution) {
  return execution.deposit ? 'Depósito' : execution.withdrawal ? 'Retiro' : 'Saldo';
}
function label(execution: BalanceExecution) {
  return `${operation(execution)} · STAN ${execution.correlation?.stan ?? '—'} · ${new Date(execution.startedAt).toLocaleString()} · ${execution.requestId}`;
}

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
  const [referenceId, setReferenceId] = useState('');
  const id = useId();
  const available = candidates.filter(
    (item) => item.environment === 'QA' && item.requestId !== execution.requestId,
  );
  const reference = available.find((item) => item.requestId === referenceId);
  return (
    <section className="transaction-comparison" aria-label="Comparador de transacciones">
      <h3>Comparar transacciones</h3>
      <label htmlFor={id}>Operación de referencia</label>
      <select
        id={id}
        value={reference?.requestId ?? ''}
        onChange={(event) => setReferenceId(event.target.value)}
      >
        <option value="">Selecciona una referencia del historial cargado</option>
        {available.map((item) => (
          <option key={item.requestId} value={item.requestId}>
            {label(item)}
          </option>
        ))}
      </select>
      {!available.length && <p>No hay otra operación cargada para comparar.</p>}
      {reference && (
        <ComparisonDetails
          key={reference.requestId}
          reference={reference}
          execution={execution}
          client={client}
          complete={complete}
          currentSession={currentSession}
        />
      )}
    </section>
  );
}

function ComparisonDetails({
  reference,
  execution,
  client,
  complete,
  currentSession,
}: {
  reference: BalanceExecution;
  execution: BalanceExecution;
  client: DesktopClient | undefined;
  complete: boolean;
  currentSession: SessionMessages | undefined;
}) {
  const session = useSessionMessages(client, reference, complete);
  const [onlyDifferences, setOnlyDifferences] = useState(true);
  const referenceMessages = messages(reference);
  const currentMessages = messages(execution);
  return (
    <>
      <p>Referencia: {label(reference)}</p>
      <p>Actual: {label(execution)}</p>
      <p>
        Comparación literal de evidencia guardada; no certifica aprobación, débito ni dispensación.
        STAN y RRN se señalan como identificadores variables, sin ocultar sus diferencias.
      </p>
      <p>
        Tiempo registrado: referencia {reference.elapsedMs} ms · actual {execution.elapsedMs} ms.
        Código de respuesta: referencia {reference.responseCode ?? 'Sin respuesta'} · actual{' '}
        {execution.responseCode ?? 'Sin respuesta'}.
      </p>
      {complete && (
        <div role="status">
          {session.loading
            ? 'Consultando mensajes de referencia…'
            : (session.error ??
              (session.value
                ? 'Referencia: valores completos disponibles.'
                : 'Referencia: original completo no disponible; se compara la versión protegida.'))}
          <button className="text-button" onClick={session.refresh}>
            Actualizar referencia
          </button>
        </div>
      )}
      <label>
        <input
          type="checkbox"
          checked={onlyDifferences}
          onChange={(event) => setOnlyDifferences(event.target.checked)}
        />
        Solo diferencias y valores no verificables
      </label>
      {slots.map(([slot, title]) => {
        const leftPublic = referenceMessages[slot];
        const rightPublic = currentMessages[slot];
        if (slot.startsWith('reversal') && !reference.reversal && !execution.reversal) return null;
        const leftFull =
          complete && leftPublic ? session.value?.messages[leftPublic.mti] : undefined;
        const rightFull =
          complete && rightPublic ? currentSession?.messages[rightPublic.mti] : undefined;
        const rows = compareIsoMessages(
          { message: leftFull ?? leftPublic, complete: !!leftFull },
          { message: rightFull ?? rightPublic, complete: !!rightFull },
        ).filter((row) => !onlyDifferences || row.status !== 'equal');
        return (
          <section key={slot} aria-label={`Comparación de ${title.toLowerCase()}`}>
            <h4>{title}</h4>
            {(!leftPublic || !rightPublic) && (
              <p>
                Mensaje no disponible en{' '}
                {!leftPublic && !rightPublic
                  ? 'ambas operaciones'
                  : !leftPublic
                    ? 'la referencia'
                    : 'la operación actual'}
                . No se puede verificar la comparación.
              </p>
            )}
            {rows.length ? (
              <div className="comparison-scroll">
                <table
                  className="inspector-table"
                  aria-label={`Diferencias de ${title.toLowerCase()}`}
                >
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Referencia</th>
                      <th>Actual</th>
                      <th>Comparación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} data-comparison={row.status}>
                        <th scope="row">
                          {row.id} · {row.label}
                          {row.variable && <small> · Identificador variable</small>}
                        </th>
                        <td className="iso-field-value">{row.reference ?? 'No disponible'}</td>
                        <td className="iso-field-value">{row.current ?? 'No disponible'}</td>
                        <td>{statusLabels[row.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>Sin diferencias en los valores disponibles de este mensaje.</p>
            )}
          </section>
        );
      })}
    </>
  );
}
