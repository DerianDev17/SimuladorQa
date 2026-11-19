import { useEffect, useRef, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { parseTransactionHistoryQuery } from '../../../../packages/domain/src/transaction-history';
import type {
  TransactionHistoryQuery,
  TransactionHistoryPage,
  TransactionHistoryCursor,
} from '../../../../packages/domain/src/transaction-history';
import type { DesktopClient } from './desktop-client';
import { executionAtm } from './transaction-inspection';
import { executionOutcomeLabel } from './transaction-outcome';

export function ArchivedTransactionHistory({
  client,
  catalog,
  onSelect,
  selectedId,
}: {
  client: DesktopClient;
  catalog: CatalogSnapshot | undefined;
  selectedId: string | undefined;
  onSelect: (execution: BalanceExecution) => void;
}) {
  const [filters, setFilters] = useState({ from: '', to: '', reference: '', operation: '' });
  const [query, setQuery] = useState<TransactionHistoryQuery>({ environment: 'QA' });
  const [page, setPage] = useState<TransactionHistoryPage>();
  const [cursors, setCursors] = useState<(TransactionHistoryCursor | undefined)[]>([undefined]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);

  async function read(request: TransactionHistoryQuery, nextCursors: typeof cursors) {
    const id = ++generation.current;
    setBusy(true);
    setError('');
    const result = await client.call((api) => api.listTransactionHistory(request));
    if (id !== generation.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPage(result.value);
    setQuery(request);
    setCursors(nextCursors);
  }
  useEffect(() => {
    void read({ environment: 'QA' }, [undefined]);
    return () => {
      generation.current++;
    };
  }, [client]);

  function apply() {
    const values: Record<string, unknown> = { environment: 'QA' };
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (key === 'from' || key === 'to') {
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) {
          setError('Revisa las fechas.');
          return;
        }
        values[key] = date.toISOString();
      } else values[key] = value;
    }
    const parsed = parseTransactionHistoryQuery(values);
    if (!parsed) {
      setError('Revisa las fechas y la referencia. Hasta debe ser posterior a Desde.');
      return;
    }
    void read(parsed, [undefined]);
  }
  function go(before: TransactionHistoryCursor | undefined, nextCursors: typeof cursors) {
    const request = { ...query };
    delete request.before;
    if (before) request.before = before;
    void read(request, nextCursors);
  }
  return (
    <section aria-label="Historial completo">
      <h3>Buscar en todo el historial</h3>
      <p>
        Consulta los diarios completos de Qa. Hasta 50 registros por página; abrir una operación no
        la reenvía.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <fieldset disabled={busy} className="transaction-history-filters">
          <legend>Filtros de todos los registros</legend>
          <label>
            Desde (hora local)
            <input
              type="datetime-local"
              value={filters.from}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </label>
          <label>
            Hasta (exclusivo, hora local)
            <input
              type="datetime-local"
              value={filters.to}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </label>
          <label>
            Referencia en todo el historial
            <input
              type="search"
              maxLength={120}
              placeholder="STAN, RRN, Terminal ID o UUID"
              value={filters.reference}
              onChange={(e) => setFilters({ ...filters, reference: e.target.value })}
            />
          </label>
          <label>
            Tipo de operación
            <select
              value={filters.operation}
              onChange={(e) => setFilters({ ...filters, operation: e.target.value })}
            >
              <option value="">Todas</option>
              <option value="BALANCE">Saldo</option>
              <option value="WITHDRAWAL">Retiro</option>
              <option value="DEPOSIT">Depósito</option>
            </select>
          </label>
          <button type="submit">Buscar historial completo</button>
          <button
            type="button"
            onClick={() => {
              setFilters({ from: '', to: '', reference: '', operation: '' });
              void read({ environment: 'QA' }, [undefined]);
            }}
          >
            Limpiar búsqueda
          </button>
        </fieldset>
      </form>
      {busy && <p role="status">Consultando historial completo…</p>}
      {error && (
        <p role="alert">
          {error}
          {page &&
            ' Se conserva la página de la última consulta correcta; los nuevos filtros no se han aplicado.'}
        </p>
      )}
      {page && (
        <>
          <div
            className="activity-table-scroll"
            role="region"
            aria-label="Registros históricos"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>Fecha local</th>
                  <th>Operación</th>
                  <th>ATM</th>
                  <th>STAN / RRN</th>
                  <th>Resultado</th>
                  <th>Abrir</th>
                </tr>
              </thead>
              <tbody>
                {page.entries.map((item) => (
                  <tr
                    key={item.requestId}
                    className={selectedId === item.requestId ? 'is-selected' : ''}
                  >
                    <td>{new Date(item.startedAt).toLocaleString('es-EC')}</td>
                    <td>
                      {item.deposit
                        ? 'Depósito'
                        : item.withdrawal
                          ? item.reversal
                            ? 'Retiro + reverso'
                            : 'Retiro'
                          : 'Consulta de saldo'}
                      {(item.deposit || item.withdrawal) &&
                        ` · USD ${item.deposit?.amount ?? item.withdrawal?.amount}`}
                    </td>
                    <td>{executionAtm(item, catalog)}</td>
                    <td>
                      {item.correlation?.stan ?? '—'} / {item.correlation?.rrn ?? '—'}
                    </td>
                    <td>{executionOutcomeLabel(item)}</td>
                    <td>
                      <button
                        className="text-button"
                        aria-pressed={selectedId === item.requestId}
                        aria-label={`Abrir operación histórica ${item.correlation?.stan ?? item.requestId}`}
                        onClick={() => onSelect(item)}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!page.entries.length && <p>No hay transacciones para los filtros aplicados.</p>}
          <nav aria-label="Páginas del historial completo" className="load-history-actions">
            <button
              disabled={busy || cursors.length < 2}
              onClick={() => {
                const previous = cursors.slice(0, -1);
                go(previous.at(-1), previous);
              }}
            >
              Anterior
            </button>
            <span>
              Página {cursors.length} · {page.entries.length} registros
            </span>
            <button
              disabled={busy || !page.next}
              onClick={() => {
                if (page.next) go(page.next, [...cursors, page.next]);
              }}
            >
              Siguiente
            </button>
            <button disabled={busy} onClick={() => go(cursors.at(-1), cursors)}>
              Actualizar página
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
