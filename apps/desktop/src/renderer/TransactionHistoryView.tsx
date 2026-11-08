import { useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import type { HistorySnapshot } from './transaction-history';
import {
  executionAtm,
  executionCategory,
  filterExecutionHistory,
  type HistoryFilters,
} from './transaction-inspection';
import { executionOutcomeLabel } from './transaction-outcome';
import { Icon } from './Icon';

const outcomes = [
  ['all', 'Todos los resultados'],
  ['approved', 'Aprobados'],
  ['not-approved', 'No aprobados'],
  ['review', 'Por revisar'],
  ['pending', 'En curso'],
  ['blocked', 'Sin completar'],
] as const;
export function TransactionHistoryView({
  items,
  selectedId,
  catalog,
  history,
  onRefresh,
  onSelect,
}: {
  items: readonly BalanceExecution[];
  selectedId: string | undefined;
  catalog: CatalogSnapshot | undefined;
  history: HistorySnapshot;
  onRefresh: () => void;
  onSelect: (item: BalanceExecution) => void;
}) {
  const [filters, setFilters] = useState<HistoryFilters>({ query: '', atmId: '', outcome: 'all' });
  const visible = filterExecutionHistory(items, filters, catalog);
  const atms = [...new Set(items.map((item) => item.atmId))];
  return (
    <section className="panel transaction-history" aria-label="Historial local">
      <div className="panel-heading">
        <h2>Historial local</h2>
        <button className="text-button" disabled={history.loading} onClick={onRefresh}>
          <Icon name="history" size={15} />
          {history.loading ? 'Actualizando…' : 'Actualizar historial'}
        </button>
      </div>
      <div className="transaction-history-filters">
        <label>
          <span className="visually-hidden">Buscar operación, ATM o referencia</span>
          <input
            type="search"
            aria-label="Buscar operación, ATM o referencia"
            placeholder="Buscar operación, ATM, STAN o RRN"
            maxLength={120}
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </label>
        <label>
          <span className="visually-hidden">Resultado del historial</span>
          <select
            aria-label="Resultado del historial"
            value={filters.outcome}
            onChange={(event) => {
              const option = outcomes.find((item) => item[0] === event.target.value);
              if (option) setFilters({ ...filters, outcome: option[0] });
            }}
          >
            {outcomes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {atms.length > 1 && (
          <label>
            <span className="visually-hidden">ATM del historial</span>
            <select
              aria-label="ATM del historial"
              value={filters.atmId}
              onChange={(event) => setFilters({ ...filters, atmId: event.target.value })}
            >
              <option value="">Todos los ATM</option>
              {atms.map((id) => (
                <option key={id} value={id}>
                  {catalog?.atms.find((atm) => atm.id === id)?.alias ??
                    executionAtm(
                      items.find((item) => item.atmId === id)!,
                      catalog,
                    )}
                </option>
              ))}
            </select>
          </label>
        )}
        {(filters.query || filters.atmId || filters.outcome !== 'all') && (
          <button
            className="text-button"
            onClick={() => setFilters({ query: '', atmId: '', outcome: 'all' })}
          >
            Limpiar filtros
          </button>
        )}
      </div>
      {history.issues.length > 0 && (
        <div className="history-warning" role="status">
          <strong>Historial incompleto; se conserva la última información disponible.</strong>
          {history.issues.map((issue) => (
            <p key={issue.source}>
              {issue.source === 'balances' ? 'Saldos' : 'Retiros'}: {issue.message}
            </p>
          ))}
        </div>
      )}
      <div className="activity-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Hora</th>
              <th>Operación</th>
              <th>ATM</th>
              <th>Monto</th>
              <th>Resultado</th>
              <th>
                <span className="visually-hidden">Abrir operación</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
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
                </td>
                <td>{executionAtm(item, catalog)}</td>
                <td>
                  {item.deposit
                    ? `USD ${item.deposit.amount}`
                    : item.withdrawal
                      ? `USD ${item.withdrawal.amount}`
                      : '—'}
                </td>
                <td>
                  <span className={`history-outcome is-${executionCategory(item)}`}>
                    {executionOutcomeLabel(item)}
                  </span>
                </td>
                <td>
                  <button
                    className="text-button"
                    aria-pressed={selectedId === item.requestId}
                    aria-label={`Abrir operación ${item.correlation?.stan ?? item.requestId}`}
                    onClick={() => onSelect(item)}
                  >
                    {selectedId === item.requestId ? 'Viendo' : 'Abrir'}
                  </button>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={6} className="session-empty">
                  {history.loading
                    ? 'Cargando historial local…'
                    : items.length
                      ? 'No hay coincidencias para estos filtros.'
                      : 'No hay transacciones registradas en el historial disponible.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="history-scope">
        {visible.length} de {items.length} registros disponibles · últimos 50 por operación y
        actividad de esta sesión.
      </p>
    </section>
  );
}
