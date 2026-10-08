import { useEffect, useRef, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import { parseObservationRequest } from '../../../../packages/domain/src/observations';
import type {
  ObservationRequest,
  ObservationSearch,
  MessageContractReview,
} from '../../../../packages/domain/src/observations';
import { DesktopClient } from './desktop-client';

const observerClient = new DesktopClient(window.desktop, 20_000);
export function ObservationView({
  environment,
  disabled,
}: {
  environment: Environment | undefined;
  disabled: boolean;
}) {
  const [filters, setFilters] = useState({
    entityId: '205',
    channelId: '1',
    from: '2026-09-29 00:00:07.803',
    to: '2026-09-29 23:00:07.803',
    terminalId: '',
    transactionCode: '',
    terminalSequence: '',
    returnCode: '',
    limit: '50',
  });
  const [result, setResult] = useState<ObservationSearch>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string>();
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  useEffect(() => {
    if (disabled) {
      generation.current++;
      setResult(undefined);
      setSelected(undefined);
      setError(undefined);
      setBusy(false);
    }
  }, [disabled]);

  function update(key: keyof typeof filters, value: string) {
    generation.current++;
    setFilters((current) => ({ ...current, [key]: value }));
    setResult(undefined);
    setSelected(undefined);
    setError(undefined);
  }
  async function search() {
    if (busy || disabled || environment !== 'PREPROD') return;
    const request: ObservationRequest = {
      ...filters,
      entityId: Number(filters.entityId),
      channelId: Number(filters.channelId),
      limit: Number(filters.limit),
      environment,
    };
    if (
      !filters.entityId.trim() ||
      !filters.channelId.trim() ||
      !parseObservationRequest(request)
    ) {
      setError(
        'Revisa los filtros. Usa fechas YYYY-MM-DD HH:mm:ss.SSS, hasta 24 horas y de 1 a 100 resultados.',
      );
      return;
    }
    const current = ++generation.current;
    setBusy(true);
    setResult(undefined);
    setSelected(undefined);
    setError(undefined);
    const response = await observerClient.call((api) => api.searchObservations(request));
    if (current !== generation.current) return;
    setBusy(false);
    if (response.ok) setResult(response.value);
    else setError(response.error.message);
  }
  const row = result?.rows.find((item) => item.traceId === selected);
  return (
    <section className="panel observation-view" aria-label="Consulta de Mediator">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">OBSERVADOR · PREPROD</span>
          <h2>Transacciones y mensajes de Mediator</h2>
        </div>
      </div>
      <p>
        Consulta externa de Journal y Message por TraceId. RetCode se muestra tal como está
        registrado, sin clasificar el resultado ATM.
      </p>
      {environment !== 'PREPROD' && (
        <p role="status" className="document-note">
          Selecciona PREPROD para consultar Mediator.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <fieldset disabled={busy || disabled || environment !== 'PREPROD'}>
          <legend>Filtros de consulta</legend>
          <div className="observation-filters">
            {(
              [
                ['entityId', 'Entidad', 5],
                ['channelId', 'Canal', 5],
                ['from', 'Desde (hora SQL)', 23],
                ['to', 'Hasta (hora SQL)', 23],
                ['terminalId', 'Terminal exacto (opcional)', 10],
                ['transactionCode', 'TrnCode (opcional)', 6],
                ['terminalSequence', 'Secuencia terminal (opcional)', 19],
                ['returnCode', 'RetCode (opcional)', 11],
                ['limit', 'Máximo de resultados', 3],
              ] as const
            ).map(([key, label, maxLength]) => (
              <label key={key}>
                {label}
                <input
                  value={filters[key]}
                  maxLength={maxLength}
                  onChange={(event) => update(key, event.target.value)}
                  required={['entityId', 'channelId', 'from', 'to', 'limit'].includes(key)}
                />
              </label>
            ))}
          </div>
          <button type="submit" className="primary">
            {busy ? 'Consultando…' : 'Consultar Mediator'}
          </button>
        </fieldset>
      </form>
      <p className="observation-note">
        Intervalo inclusivo, hasta 24 horas. La zona horaria SQL está pendiente de confirmar.
        Journal usa NOLOCK: puede incluir lecturas sin confirmar.
      </p>
      {busy && <p role="status">Consultando Mediator…</p>}
      {error && (
        <p role="alert" className="observation-error">
          {error}
        </p>
      )}
      {result && (
        <>
          <p role="status">
            {result.rows.length === 0
              ? 'No se encontraron transacciones con estos filtros.'
              : `${result.rows.length} transacciones encontradas.`}{' '}
            {result.hasMore ? 'Hay más resultados; acota los filtros.' : ''}
          </p>
          <div className="observation-table">
            <table>
              <thead>
                <tr>
                  <th>TraceId</th>
                  <th>Fecha SQL</th>
                  <th>Terminal</th>
                  <th>Secuencia</th>
                  <th>TrnCode</th>
                  <th>MsgType</th>
                  <th>RetCode</th>
                  <th>Mensajes</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((item) => (
                  <tr key={item.traceId}>
                    <td>{item.traceId}</td>
                    <td>{item.occurredAt ?? 'Sin dato'}</td>
                    <td>{item.terminalId ?? 'Sin dato'}</td>
                    <td>{item.terminalSequence ?? 'Sin dato'}</td>
                    <td>{item.transactionCode ?? 'Sin dato'}</td>
                    <td>{item.messageType ?? 'Sin dato'}</td>
                    <td>{item.returnCode ?? 'Sin dato'}</td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(item.traceId)}
                        aria-label={`Ver mensajes de ${item.traceId}`}
                      >
                        Ver mensajes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="observation-note">
            Consulta {result.queryId} · {result.queriedAt} · Los resultados permanecen solo en esta
            vista.
          </p>
        </>
      )}
      {row && (
        <section aria-label="Mensajes protegidos" className="observation-messages">
          <h3>Mensajes · TraceId {row.traceId}</h3>
          <p>
            Vista de estructura XML. Todos los valores están protegidos; campos o formatos no
            documentados se ocultan.
          </p>
          <h4>Request</h4>
          <pre>{row.requestStructure}</pre>
          {row.requestContract && <ContractReview review={row.requestContract} />}
          <h4>Response</h4>
          <pre>{row.responseStructure}</pre>
          {row.responseContract && <ContractReview review={row.responseContract} />}
        </section>
      )}
    </section>
  );
}

function ContractReview({ review }: { review: MessageContractReview }) {
  if (review.status === 'UNAVAILABLE')
    return <p>El mensaje no está disponible para revisar sus campos.</p>;
  return (
    <div aria-label="Revisión de campos CMS">
      <p>
        Revisión de presencia y tipos según CMS, páginas 16–19: {review.requiredFieldCount} campos
        mandatorios. Esta revisión no determina el resultado financiero.
      </p>
      <p>
        {review.missingRequired.length
          ? `Mandatorios ausentes: ${review.missingRequired.map((field) => `${field.section}.${field.name}`).join(', ')}.`
          : 'Todos los nombres mandatorios están presentes; sus valores permanecen protegidos.'}
      </p>
      {review.aliases.length > 0 && (
        <p>
          Variantes de nombre observadas:{' '}
          {review.aliases
            .map((field) => `${field.observedName} (tabla: ${field.documentedName})`)
            .join(', ')}
          .
        </p>
      )}
      {review.typeDifferences.length > 0 && (
        <p>
          Diferencias de tipo:{' '}
          {review.typeDifferences
            .map(
              (field) =>
                `${field.section}.${field.name}: ${field.observed} (tabla: ${field.documented})`,
            )
            .join(', ')}
          .
        </p>
      )}
      {review.duplicates.length > 0 && (
        <p>
          Campos repetidos:{' '}
          {review.duplicates.map((field) => `${field.section}.${field.name}`).join(', ')}.
        </p>
      )}
    </div>
  );
}
