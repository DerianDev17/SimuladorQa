import { LoadExportActions } from './LoadExportActions';
import { HistoryAtmFilter } from './HistoryAtmFilter';
import { useEffect, useRef, useState } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import {
  loadStateLabels,
  parseLoadHistoryQuery,
} from '../../../../packages/domain/src/load-history';
import type {
  LoadHistoryPage,
  LoadHistoryQuery,
} from '../../../../packages/domain/src/load-history';
import { loadRunMetrics } from '../../../../packages/domain/src/load-run';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import { loadTestAtms } from '../../../../packages/domain/src/load-test';
import { DesktopClient } from './desktop-client';

function pageQuery(query: LoadHistoryQuery, before?: number): LoadHistoryQuery {
  const result = { ...query };
  delete result.before;
  if (before !== undefined) result.before = before;
  return result;
}
const client = new DesktopClient(window.desktop);
const localDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');
const milliseconds = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)} ms`);

export function LoadHistoryDetail({ run }: { run: LoadRunSnapshot }) {
  const metrics = loadRunMetrics(run);
  return (
    <section className="load-history-detail" aria-label="Detalle de corrida guardada">
      <LoadExportActions key={run.runId} run={run} />
      <h3>
        {loadStateLabels[run.state]} · {run.draft.operation === 'WITHDRAWAL' ? 'Retiro' : 'Saldo'}
      </h3>
      <p>Run ID: {run.runId}</p>
      <p>
        Inicio: {localDate(run.startedAt)} · Fin: {localDate(run.finishedAt)}
      </p>
      <p>
        QA · {run.draft.mode} · {run.draft.maxTransactions} operaciones como máximo ·{' '}
        {run.draft.durationSeconds} s · {run.draft.concurrency} en curso · Rampa:{' '}
        {run.draft.rampUpSeconds} s
      </p>
      {run.draft.operation === 'WITHDRAWAL' && <p>Monto por retiro: USD {run.draft.amount}</p>}
      <p>
        ATM (UUID):{' '}
        {loadTestAtms(run.draft)
          .map((atm) => atm.atmId)
          .join(', ')}
      </p>
      <div className="load-metrics">
        {Object.entries({
          'TPS objetivo': run.draft.targetTps.toFixed(2),
          'TPS real': metrics.tps.toFixed(2),
          Enviadas: metrics.sent,
          Respuestas: metrics.received,
          Aprobadas: metrics.approved,
          Rechazadas: metrics.declined,
          Timeouts: metrics.timeouts,
          Errores: metrics.errors,
          Canceladas: metrics.cancelled,
          'Enviadas sin respuesta': metrics.unconfirmed,
        }).map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p>
        Latencias: mín. {milliseconds(metrics.min)} · promedio {milliseconds(metrics.avg)} · p50{' '}
        {milliseconds(metrics.p50)} · p90 {milliseconds(metrics.p90)} · p95{' '}
        {milliseconds(metrics.p95)} · p99 {milliseconds(metrics.p99)} · máx.{' '}
        {milliseconds(metrics.max)}
      </p>
      <p>
        TPS real incluye preparación y cierre. Los errores incluyen timeouts; los contadores no son
        categorías excluyentes. Este registro no confirma débitos ni conciliación en Core.
      </p>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Operaciones de la corrida guardada"
      >
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>ATM</th>
              <th>Transaction ID</th>
              <th>STAN</th>
              <th>RRN</th>
              <th>Resultado</th>
              <th>RC</th>
              <th>Enviada / respuesta</th>
              <th>Transporte</th>
            </tr>
          </thead>
          <tbody>
            {run.items.map((item) => (
              <tr key={item.requestId}>
                <td>{localDate(item.finishedAt ?? null)}</td>
                <td>
                  {item.correlation?.terminalId ??
                    item.atmId ??
                    (loadTestAtms(run.draft).length === 1 ? run.draft.atmId : 'No registrado')}
                </td>
                <td>{item.transactionId ?? '—'}</td>
                <td>{item.correlation?.stan ?? '—'}</td>
                <td>{item.correlation?.rrn ?? '—'}</td>
                <td>
                  {item.outcome}
                  {item.cancelled ? ' · Cancelada' : ''}
                </td>
                <td>{item.responseCode ?? '—'}</td>
                <td>
                  {item.sent ? 'Sí' : 'No'} / {item.received ? 'Sí' : 'No'}
                </td>
                <td>{milliseconds(item.elapsedMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!run.items.length && <p>No hay operaciones registradas en esta corrida.</p>}
    </section>
  );
}

export function LoadHistoryView({ atms }: { atms: readonly AtmProfile[] }) {
  const [filters, setFilters] = useState({ from: '', to: '', atmId: '', operation: '', state: '' });
  const [query, setQuery] = useState<LoadHistoryQuery>({});
  const [cursors, setCursors] = useState<(number | undefined)[]>([undefined]);
  const [page, setPage] = useState<LoadHistoryPage | null>(null);
  const [detail, setDetail] = useState<LoadRunSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  async function list(request: LoadHistoryQuery, history: (number | undefined)[]) {
    const id = ++generation.current;
    setBusy(true);
    setError('');
    setPage(null);
    setDetail(null);
    setQuery(request);
    const result = await client.call((api) => api.listLoadHistory(request));
    if (id !== generation.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setPage(result.value);
    setCursors(history);
  }
  useEffect(() => {
    void list({}, [undefined]);
    return () => {
      generation.current++;
    };
  }, []);
  async function show(runId: string) {
    const id = ++generation.current;
    setBusy(true);
    setError('');
    setDetail(null);
    const result = await client.call((api) => api.getLoadHistory({ runId }));
    if (id !== generation.current) return;
    setBusy(false);
    if (!result.ok) setError(result.error.message);
    else if (!result.value) setError('La corrida ya no está disponible. Actualiza el historial.');
    else setDetail(result.value);
  }
  function apply() {
    const values: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (!value) continue;
      if (key === 'from' || key === 'to') {
        const time = new Date(value);
        if (!Number.isFinite(time.getTime())) {
          setError('Fecha inválida.');
          return;
        }
        values[key] = time.toISOString();
      } else values[key] = value;
    }
    const parsed = parseLoadHistoryQuery(values);
    if (!parsed) {
      setError('Revisa el UUID del ATM y el intervalo de fechas.');
      return;
    }
    void list(parsed, [undefined]);
  }
  return (
    <section className="panel load-history" aria-label="Historial de carga">
      <h2>Historial de carga</h2>
      <p>
        Corridas guardadas en QA, de la más reciente a la más antigua. Fechas en hora local; hasta
        20 corridas por página.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <fieldset disabled={busy} className="load-history-filters">
          <legend>Filtros del historial</legend>
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
          <HistoryAtmFilter
            atms={atms}
            value={filters.atmId}
            onChange={(atmId) => setFilters({ ...filters, atmId })}
          />
          <label>
            Operación del historial
            <select
              value={filters.operation}
              onChange={(e) => setFilters({ ...filters, operation: e.target.value })}
            >
              <option value="">Todas</option>
              <option value="BALANCE">Saldo</option>
              <option value="WITHDRAWAL">Retiro</option>
            </select>
          </label>
          <label>
            Estado del historial
            <select
              value={filters.state}
              onChange={(e) => setFilters({ ...filters, state: e.target.value })}
            >
              <option value="">Todos</option>
              {Object.entries(loadStateLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit">Aplicar filtros</button>
          <button
            type="button"
            onClick={() => {
              setFilters({ from: '', to: '', atmId: '', operation: '', state: '' });
              void list({}, [undefined]);
            }}
          >
            Limpiar filtros
          </button>
        </fieldset>
      </form>
      {busy && <p role="status">Consultando historial…</p>}
      {error && <p role="alert">{error}</p>}
      <button disabled={busy} onClick={() => void list(pageQuery(query), [undefined])}>
        Actualizar historial
      </button>
      {page && (
        <>
          {!page.entries.length ? (
            <p>No hay corridas para los filtros aplicados.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Inicio</th>
                    <th>Operación</th>
                    <th>Estado</th>
                    <th>TPS objetivo / real</th>
                    <th>Enviadas</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {page.entries.map((entry) => (
                    <tr key={entry.runId}>
                      <td>{localDate(entry.startedAt)}</td>
                      <td>
                        {entry.draft.operation === 'WITHDRAWAL'
                          ? `Retiro · USD ${entry.draft.amount}`
                          : 'Saldo'}
                      </td>
                      <td>{loadStateLabels[entry.state]}</td>
                      <td>
                        {entry.draft.targetTps.toFixed(2)} / {entry.metrics.tps.toFixed(2)}
                      </td>
                      <td>{entry.metrics.sent}</td>
                      <td>
                        <button
                          disabled={busy}
                          onClick={() => void show(entry.runId)}
                          aria-label={`Ver corrida ${entry.runId}`}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav aria-label="Páginas del historial" className="load-history-actions">
            <button
              disabled={busy || cursors.length < 2}
              onClick={() => {
                const previous = cursors.slice(0, -1);
                void list(pageQuery(query, previous.at(-1)), previous);
              }}
            >
              Anterior
            </button>
            <span>Página {cursors.length}</span>
            <button
              disabled={busy || page.next === null}
              onClick={() => {
                if (page.next !== null)
                  void list({ ...query, before: page.next }, [...cursors, page.next]);
              }}
            >
              Siguiente
            </button>
          </nav>
        </>
      )}
      {detail && (
        <>
          <button disabled={busy} onClick={() => void show(detail.runId)}>
            Actualizar detalle
          </button>
          <LoadHistoryDetail run={detail} />
        </>
      )}
    </section>
  );
}
