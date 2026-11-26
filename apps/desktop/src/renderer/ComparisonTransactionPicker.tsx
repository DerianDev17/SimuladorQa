import { useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { DesktopClient } from './desktop-client';
import { ArchivedTransactionHistory } from './ArchivedTransactionHistory';
import { filterExecutionHistory } from './transaction-inspection';
import { executionOutcomeLabel } from './transaction-outcome';

export function comparisonOperation(item: BalanceExecution): string {
  return item.deposit
    ? 'Depósito'
    : item.withdrawal
      ? item.reversal
        ? 'Retiro + reverso'
        : 'Retiro'
      : 'Saldo';
}
export function ComparisonTransactionCard({
  item,
  side,
  onChoose,
}: {
  item: BalanceExecution | undefined;
  side: 'A' | 'B';
  onChoose: () => void;
}) {
  return (
    <section className={`comparison-transaction side-${side}`} aria-label={`Transacción ${side}`}>
      <div className="comparison-card-heading">
        <span className="comparison-side">{side}</span>
        <h4>{side === 'A' ? 'Referencia' : 'Transacción a revisar'}</h4>
      </div>
      {item ? (
        <>
          <strong>
            {comparisonOperation(item)} · {executionOutcomeLabel(item)}
          </strong>
          <p>{new Date(item.startedAt).toLocaleString('es-EC')}</p>
          <dl>
            <div>
              <dt>STAN</dt>
              <dd>{item.correlation?.stan ?? '—'}</dd>
            </div>
            <div>
              <dt>RRN</dt>
              <dd>{item.correlation?.rrn ?? '—'}</dd>
            </div>
            <div>
              <dt>Terminal</dt>
              <dd>{item.correlation?.terminalId ?? '—'}</dd>
            </div>
            <div>
              <dt>Respuesta / tiempo</dt>
              <dd>
                {item.responseCode ?? 'Sin respuesta'} · {item.elapsedMs} ms
              </dd>
            </div>
          </dl>
          <details>
            <summary>Identificador de la transacción</summary>
            <p>{item.requestId}</p>
          </details>
        </>
      ) : (
        <p>Elige la operación que usarás como base para comparar.</p>
      )}
      <button className="secondary" onClick={onChoose}>
        {item ? 'Cambiar' : 'Elegir'} transacción {side}
      </button>
    </section>
  );
}
export function ComparisonTransactionPicker({
  side,
  candidates,
  excludedId,
  client,
  onSelect,
  onClose,
}: {
  side: 'A' | 'B';
  candidates: readonly BalanceExecution[];
  excludedId: string | undefined;
  client: DesktopClient | undefined;
  onSelect: (item: BalanceExecution) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<'recent' | 'archive'>('recent');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const available = candidates.filter(
    (item) => item.requestId !== excludedId && item.environment === 'QA',
  );
  const matches = filterExecutionHistory(available, { query, atmId: '', outcome: 'all' });
  function select(item: BalanceExecution) {
    if (item.environment !== 'QA' || item.requestId === excludedId) {
      setError('Elige otra transacción: A y B deben ser distintas y pertenecer a QA.');
      return;
    }
    onSelect(item);
  }
  return (
    <section className="comparison-picker" aria-label={`Elegir transacción ${side}`}>
      <div className="panel-heading">
        <h4>Elegir transacción {side}</h4>
        <button className="text-button" onClick={onClose}>
          Cancelar selección
        </button>
      </div>
      <div className="comparison-actions" role="group" aria-label="Origen de transacciones">
        <button aria-pressed={source === 'recent'} onClick={() => setSource('recent')}>
          Recientes
        </button>
        <button
          aria-pressed={source === 'archive'}
          disabled={!client}
          onClick={() => setSource('archive')}
        >
          Todo el historial
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {source === 'archive' && client ? (
        <ArchivedTransactionHistory
          client={client}
          catalog={undefined}
          selectedId={undefined}
          onSelect={select}
        />
      ) : (
        <>
          <label>
            Buscar transacción
            <input
              type="search"
              autoFocus
              maxLength={120}
              placeholder="STAN, RRN, UUID, terminal u operación"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <p role="status">
            {matches.length} transacciones disponibles. Seleccionar no realiza un envío.
          </p>
          <div className="comparison-picker-list">
            {matches.map((item) => (
              <button
                key={item.requestId}
                className="comparison-pick-item"
                onClick={() => select(item)}
                aria-label={`Usar en ${side} STAN ${item.correlation?.stan ?? item.requestId}`}
              >
                <strong>
                  {comparisonOperation(item)} · STAN {item.correlation?.stan ?? '—'}
                </strong>
                <span>
                  {new Date(item.startedAt).toLocaleString('es-EC')} · {executionOutcomeLabel(item)}
                </span>
                <span>
                  RRN {item.correlation?.rrn ?? '—'} ·{' '}
                  {item.correlation?.terminalId ?? 'Sin terminal'}
                </span>
                <small>{item.requestId}</small>
              </button>
            ))}
          </div>
          {!matches.length && (
            <p>
              No hay coincidencias en Recientes. Cambia la búsqueda o consulta Todo el historial.
            </p>
          )}
        </>
      )}
    </section>
  );
}
