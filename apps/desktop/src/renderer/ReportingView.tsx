import { useId, useState } from 'react';
import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { loadStateLabels } from '../../../../packages/domain/src/load-history';
import { loadTestAtms } from '../../../../packages/domain/src/load-test';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import { LoadHistoryView } from './LoadHistoryView';
import { LoadExportActions } from './LoadExportActions';
import { ObservationView } from './ObservationView';
import { ReportingAuditView } from './ReportingAuditView';
import { ReportingTransactionsView } from './ReportingTransactionsView';
import { useReportingData } from './useReportingData';
import { useTransactionHistory } from './useTransactionHistory';
import {
  executionCategory,
  filterExecutionHistory,
  mergeExecutionHistory,
} from './transaction-inspection';
import {
  emptyReportingFilters,
  filterAudit,
  matchesReport,
  reportingAudit,
  reportingOrigins,
  validReportingFilters,
} from './reporting';
import './reporting.css';

export type ReportingDestination = 'summary' | 'loads' | 'transactions' | 'audit' | 'mediator';
const tabs = [
  ['summary', 'Resumen'],
  ['reports', 'Reportes'],
  ['audit', 'Auditoría'],
  ['mediator', 'Mediator'],
] as const;
type Tab = (typeof tabs)[number][0];
export function ReportingView({
  snapshot,
  catalog,
  client,
  initial = 'summary',
  sessionExecutions,
}: {
  snapshot: AppSnapshot | undefined;
  catalog: CatalogSnapshot | undefined;
  client: DesktopClient;
  initial?: ReportingDestination;
  sessionExecutions: readonly BalanceExecution[];
}) {
  const [tab, setTab] = useState<Tab>(
    initial === 'loads' || initial === 'transactions' ? 'reports' : initial,
  );
  const [report, setReport] = useState<'loads' | 'transactions'>(
    initial === 'transactions' ? 'transactions' : 'loads',
  );
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(emptyReportingFilters);
  const [filters, setFilters] = useState(emptyReportingFilters);
  const [filterError, setFilterError] = useState('');
  const id = useId();
  const enabled = snapshot?.environment === 'QA';
  const data = useReportingData(client, enabled, revision);
  const history = useTransactionHistory(client, enabled, String(revision));
  const currentCatalog = data.catalog ?? catalog;
  const records = mergeExecutionHistory(
    history.balances,
    history.withdrawals,
    history.deposits,
    sessionExecutions,
  );
  const transactions = filterExecutionHistory(
    records,
    { query: filters.query, atmId: filters.atmId, outcome: 'all' },
    currentCatalog,
  ).filter((item) =>
    matchesReport(
      { ...filters, query: '' },
      { timestamp: item.startedAt, origin: 'transactions', atms: [item.atmId], text: '' },
    ),
  );
  const loads = (data.loads?.entries ?? []).filter((item) =>
    matchesReport(filters, {
      timestamp: item.startedAt,
      origin: 'load',
      atms: loadTestAtms(item.draft).map((atm) => atm.atmId),
      text: [
        item.runId,
        item.draft.operation === 'WITHDRAWAL' ? 'Retiro' : 'Saldo',
        loadStateLabels[item.state],
        ...loadTestAtms(item.draft).map(
          (atm) =>
            `${atm.atmId} ${currentCatalog?.atms.find((value) => value.id === atm.atmId)?.alias ?? ''}`,
        ),
      ].join(' '),
    }),
  );
  const closed = loads.filter((item) => !['RUNNING', 'STOPPING'].includes(item.state));
  const audit = filterAudit(
    reportingAudit({
      ...(data.catalog ? { catalog: data.catalog.audit } : {}),
      ...(data.send ? { send: data.send.audit } : {}),
      ...(data.station ? { environment: data.station.audit } : {}),
      ...(data.loadAudit ? { load: data.loadAudit } : {}),
    }),
    filters,
  );
  const busy = data.loading || history.loading;
  const issues = [
    ...data.issues,
    ...history.issues.map((issue) => ({
      source: { balances: 'Saldos', withdrawals: 'Retiros', deposits: 'Depósitos' }[issue.source],
      message: issue.message,
    })),
  ];
  const auditComplete = !!data.catalog && !!data.send && !!data.station && !!data.loadAudit;
  function openReport(source: 'loads' | 'transactions') {
    setReport(source);
    setTab('reports');
  }
  const count = (ready: boolean, value: number) =>
    ready && !busy ? value.toLocaleString('es-EC') : '—';
  return (
    <div className="reporting-workspace">
      <header className="reporting-heading">
        <div>
          <h1>Reportería y auditoría</h1>
          <p>Reportes, historial y cambios de la estación en un solo lugar.</p>
        </div>
        {(tab === 'summary' || tab === 'audit') && (
          <button disabled={!enabled || busy} onClick={() => setRevision((value) => value + 1)}>
            <Icon name="history" size={16} /> {busy ? 'Actualizando…' : 'Actualizar'}
          </button>
        )}
      </header>
      <div className="reporting-tabs" role="tablist" aria-label="Reportería y auditoría">
        {tabs.map(([key, label], index) => (
          <button
            key={key}
            role="tab"
            id={`${id}-${key}`}
            aria-controls={`${id}-${key}-panel`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                tabs[
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (index + (event.key === 'ArrowLeft' ? tabs.length - 1 : 1)) % tabs.length
                ]![0];
              setTab(next);
              document.getElementById(`${id}-${next}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!enabled ? (
        <p role="status">Espera la confirmación del ambiente Qa para consultar los registros.</p>
      ) : (
        <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`}>
          {(tab === 'summary' || tab === 'audit') && (
            <>
              <form
                className="reporting-filters panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!validReportingFilters(draft)) {
                    setFilterError(
                      'Revisa las fechas: Desde debe ser anterior a Hasta, y el ATM debe tener un UUID válido.',
                    );
                    return;
                  }
                  setFilterError('');
                  setFilters({ ...draft });
                }}
              >
                <label>
                  Desde (hora local)
                  <input
                    type="datetime-local"
                    value={draft.from}
                    onChange={(e) => setDraft({ ...draft, from: e.target.value })}
                  />
                </label>
                <label>
                  Hasta (exclusivo)
                  <input
                    type="datetime-local"
                    value={draft.to}
                    onChange={(e) => setDraft({ ...draft, to: e.target.value })}
                  />
                </label>
                <label>
                  Origen
                  <select
                    value={draft.origin}
                    onChange={(e) => setDraft({ ...draft, origin: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {Object.entries(reportingOrigins).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  ATM
                  <select
                    value={draft.atmId}
                    onChange={(e) => setDraft({ ...draft, atmId: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {currentCatalog?.atms.map((atm) => (
                      <option key={atm.id} value={atm.id}>
                        {atm.alias} · {atm.terminalId}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="reporting-search">
                  Buscar
                  <input
                    type="search"
                    placeholder="ID, STAN, recurso o usuario"
                    maxLength={120}
                    value={draft.query}
                    onChange={(e) => setDraft({ ...draft, query: e.target.value })}
                  />
                </label>
                <button className="primary" type="submit">
                  Aplicar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(emptyReportingFilters);
                    setFilters(emptyReportingFilters);
                    setFilterError('');
                  }}
                >
                  Limpiar
                </button>
              </form>
              {filterError && (
                <p role="alert" className="inline-error">
                  {filterError}
                </p>
              )}
              <p className="reporting-scope">
                Filtros sobre los registros disponibles: últimas 50 transacciones por operación y
                sesión actual, 20 corridas y hasta 100 eventos por fuente. ATM incluye solo eventos
                vinculados directamente al perfil.
              </p>
              {busy && <p role="status">Consultando registros de la estación…</p>}
              {issues.length > 0 && (
                <div role="alert" className="reporting-issues">
                  <strong>Consulta incompleta.</strong>
                  {issues.map((issue) => (
                    <p key={issue.source}>
                      {issue.source}: {issue.message}
                    </p>
                  ))}
                  <p>Actualiza para reintentar las fuentes no disponibles.</p>
                </div>
              )}
            </>
          )}
          {tab === 'summary' && (
            <>
              <dl className="reporting-metrics">
                <div>
                  <dt>Operaciones locales</dt>
                  <dd>{count(history.loaded && !history.issues.length, transactions.length)}</dd>
                </div>
                <div>
                  <dt>Corridas cerradas</dt>
                  <dd>{count(!!data.loads, closed.length)}</dd>
                </div>
                <div>
                  <dt>Eventos de auditoría</dt>
                  <dd>{count(auditComplete, audit.length)}</dd>
                </div>
                <div className="reporting-attention">
                  <dt>Resultados inciertos</dt>
                  <dd>
                    {count(
                      history.loaded && !history.issues.length,
                      transactions.filter((item) => executionCategory(item) === 'review').length,
                    )}
                  </dd>
                </div>
              </dl>
              <div className="reporting-overview">
                <section className="panel reporting-loads" aria-label="Reportes de carga">
                  <div className="panel-heading">
                    <div>
                      <h2>Reportes de carga</h2>
                      <p>Corridas cerradas disponibles para exportar.</p>
                    </div>
                    <button className="text-button" onClick={() => openReport('loads')}>
                      Ver todos
                    </button>
                  </div>
                  <div
                    className="table-wrap"
                    tabIndex={0}
                    role="region"
                    aria-label="Corridas recientes"
                  >
                    <table>
                      <thead>
                        <tr>
                          <th>Prueba</th>
                          <th>Finalizada</th>
                          <th>Estado</th>
                          <th>Exportar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {closed.slice(0, 3).map((run) => (
                          <tr key={run.runId}>
                            <td>
                              {run.draft.mode === 'STRESS' ? 'Estrés' : 'Carga'} de{' '}
                              {run.draft.operation === 'WITHDRAWAL' ? 'retiro' : 'saldo'}
                            </td>
                            <td>
                              {run.finishedAt
                                ? new Date(run.finishedAt).toLocaleString('es-EC')
                                : 'No registrada'}
                            </td>
                            <td>
                              <span className="pill neutral">{loadStateLabels[run.state]}</span>
                            </td>
                            <td>
                              <LoadExportActions run={run} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!busy && data.loads && !closed.length && (
                    <p className="reporting-empty">
                      No hay corridas cerradas en los registros disponibles para estos filtros.
                    </p>
                  )}
                  {!busy && !data.loads && <p>Historial de carga no disponible.</p>}
                </section>
                <section className="panel reporting-sources" aria-label="Consultar historial">
                  <h2>Consultar historial</h2>
                  <button onClick={() => openReport('transactions')}>
                    <Icon name="transaction" />
                    <span>
                      <strong>Transacciones</strong>
                      <small>Operaciones locales y correlación</small>
                    </span>
                    <Icon name="arrow" size={16} />
                  </button>
                  <button onClick={() => openReport('loads')}>
                    <Icon name="load" />
                    <span>
                      <strong>Carga y estrés</strong>
                      <small>Corridas, métricas y resultados</small>
                    </span>
                    <Icon name="arrow" size={16} />
                  </button>
                  <button onClick={() => setTab('mediator')}>
                    <Icon name="database" />
                    <span>
                      <strong>Mediator</strong>
                      <small>Consulta externa de Journal y Message</small>
                    </span>
                    <Icon name="arrow" size={16} />
                  </button>
                </section>
              </div>
              {!data.loading && (
                <ReportingAuditView entries={audit} preview onOpen={() => setTab('audit')} />
              )}
            </>
          )}
          {tab === 'audit' && !data.loading && (
            <>
              <ReportingAuditView key={JSON.stringify(filters)} entries={audit} />
              <p className="reporting-scope">
                Auditoría local operativa. Los registros antiguos conservan únicamente los datos que
                se guardaron.
              </p>
            </>
          )}
          {tab === 'reports' && (
            <>
              <nav className="reporting-report-picker" aria-label="Tipo de reporte">
                <button aria-pressed={report === 'loads'} onClick={() => setReport('loads')}>
                  Carga y estrés
                </button>
                <button
                  aria-pressed={report === 'transactions'}
                  onClick={() => setReport('transactions')}
                >
                  Transacciones
                </button>
              </nav>
              {report === 'loads' ? (
                <LoadHistoryView atms={currentCatalog?.atms ?? []} />
              ) : (
                <ReportingTransactionsView
                  sessionExecutions={sessionExecutions}
                  history={history}
                  catalog={currentCatalog}
                  snapshot={snapshot}
                  client={client}
                />
              )}
            </>
          )}
          {tab === 'mediator' && (
            <ObservationView environment={snapshot?.environment} disabled={!enabled} />
          )}
          <p className="reporting-footer">
            Evidencia local · Fechas locales en reportes y auditoría. Mediator conserva la hora de
            su fuente.
          </p>
        </div>
      )}
    </div>
  );
}
