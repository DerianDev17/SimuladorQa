import { useEffect, useState } from 'react';
import { dataBlockers, isEnvironment } from '../../../../packages/domain/src/index';
import type { Environment } from '../../../../packages/domain/src/index';
import type { AppSnapshot, ErrorCode, Result } from '../../../../packages/shared/src/contracts';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { SendConfigurationView } from './SendConfigurationView';
import { CatalogView } from './CatalogView';
import { TransactionWorkspace } from './TransactionWorkspace';
import { ObservationView } from './ObservationView';
import { NetworkEvidenceView } from './NetworkEvidenceView';
import type { CatalogMutation } from './CatalogView';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import { CardReaderView } from './CardReaderView';
import { SwitchConnectionView, connectionTitle, useSwitchConnection } from './SwitchConnectionView';
import type { IconName } from './Icon';
import type { AtmSelection } from './transaction-setup';
import { LoadTestView } from './LoadTestView';
import { VirtualCardGeneratorView } from './VirtualCardGeneratorView';
import type { LoadTestDraft } from '../../../../packages/domain/src/load-test';
import type { LoadTestPlan } from '../../../../packages/domain/src/load-test';

const navigation: { id: string; label: string; icon: IconName; group: string }[] = [
  { id: 'dashboard', label: 'Inicio', icon: 'dashboard', group: 'ESTACIÓN DE PRUEBAS' },
  { id: 'transactions', label: 'Transacciones', icon: 'transaction', group: '' },
  { id: 'load', label: 'Carga y estrés', icon: 'load', group: '' },
  { id: 'atms', label: 'Perfiles ATM', icon: 'atm', group: 'CATÁLOGOS' },
  { id: 'cards', label: 'Tarjetas', icon: 'card', group: '' },
  { id: 'entities', label: 'Entidades', icon: 'entity', group: '' },
  { id: 'monitor', label: 'Monitor', icon: 'monitor', group: 'OBSERVABILIDAD' },
  { id: 'history', label: 'Historial', icon: 'history', group: '' },
  { id: 'settings', label: 'Configuración', icon: 'settings', group: '' },
];
const client = new DesktopClient(window.desktop);

export function App() {
  const [page, setPage] = useState('dashboard');
  const [snapshot, setSnapshot] = useState<AppSnapshot>();
  const [error, setError] = useState<{ code: string; message: string }>();
  const [busy, setBusy] = useState(true);
  const [catalog, setCatalog] = useState<CatalogSnapshot>();
  const [catalogError, setCatalogError] = useState<{ code: ErrorCode; message: string }>();
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogEditing, setCatalogEditing] = useState(false);
  const [transactionBusy, setTransactionBusy] = useState(false);
  const [sendConfigurationEditing, setSendConfigurationEditing] = useState(false);
  const [transactionSetup, setTransactionSetup] = useState<{
    environment: Environment;
    stage: 'entities' | 'atms';
    entityId?: string;
  }>();
  const [pendingAtmSelection, setPendingAtmSelection] = useState<AtmSelection>();

  function applySnapshot(result: Result<AppSnapshot>) {
    if (result.ok) {
      setSnapshot(result.value);
      setError(undefined);
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  useEffect(() => {
    let active = true;
    void client
      .call((api) => api.getSnapshot())
      .then((result) => {
        if (active) applySnapshot(result);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const environment = snapshot?.environment;
    let active = true;
    setCatalog(undefined);
    setCatalogError(undefined);
    if (!environment)
      return () => {
        active = false;
      };
    setCatalogBusy(true);
    void client
      .call((api) => api.getCatalog(environment))
      .then((result) => {
        if (!active) return;
        if (result.ok) setCatalog(result.value);
        else setCatalogError(result.error);
        setCatalogBusy(false);
      });
    return () => {
      active = false;
    };
  }, [snapshot?.environment]);

  async function refreshCatalog() {
    if (!snapshot) return;
    setCatalogBusy(true);
    setCatalog(undefined);
    setCatalogError(undefined);
    const result = await client.call((api) => api.getCatalog(snapshot.environment));
    if (result.ok) setCatalog(result.value);
    else setCatalogError(result.error);
    setCatalogBusy(false);
  }

  async function mutateCatalog(command: CatalogMutation): Promise<boolean> {
    setCatalogBusy(true);
    setCatalogError(undefined);
    const result = await client.call((api) => {
      switch (command.kind) {
        case 'saveEntity':
          return api.saveEntity(command.request);
        case 'saveAtm':
          return api.saveAtm(command.request);
        case 'deleteEntity':
          return api.deleteEntity(command.request);
        case 'deleteAtm':
          return api.deleteAtm(command.request);
        case 'saveCase':
          return api.saveCase(command.request);
        case 'deleteCase':
          return api.deleteCase(command.request);
      }
    });
    if (result.ok) {
      setCatalog(result.value);
      if (transactionSetup?.environment === result.value.environment) {
        if (command.kind === 'saveEntity' && transactionSetup.stage === 'entities') {
          const entity = result.value.entities.find((item) =>
            command.request.id
              ? item.id === command.request.id
              : item.code === command.request.values.code,
          );
          if (entity) {
            setTransactionSetup({
              ...transactionSetup,
              entityId: entity.id,
              stage: entity.active ? 'atms' : 'entities',
            });
            if (entity.active) setPage('atms');
          }
        }
        if (command.kind === 'saveAtm' && transactionSetup.stage === 'atms') {
          const atm = result.value.atms.find((item) =>
            command.request.id
              ? item.id === command.request.id
              : item.terminalId === command.request.values.terminalId,
          );
          if (
            atm?.active &&
            result.value.entities.some((entity) => entity.id === atm.entityId && entity.active)
          ) {
            setPendingAtmSelection({
              environment: result.value.environment,
              id: atm.id,
              revision: atm.revision,
            });
            setTransactionSetup(undefined);
            setPage('transactions');
          }
        }
      }
    } else setCatalogError(result.error);
    setCatalogBusy(false);
    return result.ok;
  }

  async function refresh() {
    setBusy(true);
    applySnapshot(await client.call((api) => api.getSnapshot()));
  }

  async function changeEnvironment(environment: Environment) {
    setTransactionSetup(undefined);
    setPendingAtmSelection(undefined);
    setBusy(true);
    const result = await client.call((api) => api.setEnvironment(environment));
    if (!result.ok && result.error.code === 'TIMEOUT') {
      // Un timeout IPC no cancela una escritura ya iniciada. Reconciliar con Main.
      applySnapshot(await client.call((api) => api.getSnapshot()));
      setError(result.error);
    } else {
      applySnapshot(result);
    }
  }

  const environment = snapshot?.environment;
  const link = useSwitchConnection(client, environment);
  const linkTitle =
    environment === 'QA' ? connectionTitle(link.connection) : 'Conexión QA inactiva';
  const current = navigation.find((item) => item.id === page);
  const blockers = snapshot?.blockers ?? dataBlockers;

  function goToTransactions() {
    setTransactionSetup(undefined);
    setPage('transactions');
  }
  function navigateFromTransaction(next: 'entities' | 'atms' | 'settings' | 'history') {
    if ((next === 'entities' || next === 'atms') && environment) {
      setTransactionSetup({ environment, stage: next });
    } else setTransactionSetup(undefined);
    setPage(next);
  }

  function blockerList() {
    return (
      <div className="blocker-list">
        {blockers.map((blocker, index) => (
          <div className="blocker" key={blocker.id}>
            <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <details className="inline-details">
                <summary>{blocker.label}</summary>
                <p>{blocker.description}</p>
              </details>
            </div>
            <span className="pill amber">Pendiente</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">
            <span />
          </span>
          <div>
            <strong>
              Coonecta<span className="brand-dot">.</span>
            </strong>
            <small>ATM Simulator</small>
          </div>
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map((item) => (
            <div key={item.id} className={item.id === 'settings' ? 'nav-settings' : undefined}>
              {item.group && <p className="nav-group">{item.group}</p>}
              <button
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                aria-current={page === item.id ? 'page' : undefined}
                disabled={catalogEditing || catalogBusy || sendConfigurationEditing}
                onClick={() => {
                  setTransactionSetup(undefined);
                  setPage(item.id);
                }}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-station">
            <span className="user-avatar">QA</span>
            <span>Estación QA</span>
            <span>v{snapshot?.version ?? '0.1.0'}</span>
          </div>
          <div className="sidebar-security">
            <Icon name="shield" size={15} /> Producción bloqueada
          </div>
        </div>
      </aside>

      <div className={`main-area ${environment === 'PREPROD' ? 'preprod' : ''}`}>
        <header className="topbar">
          <div className="breadcrumb">
            Operación <span>/</span> <strong>{current?.label}</strong>
          </div>
          <div className="topbar-actions">
            <label className="environment-label">
              <span className="visually-hidden">Ambiente</span>
              <select
                aria-label="Ambiente"
                value={environment ?? ''}
                disabled={
                  busy ||
                  !snapshot ||
                  catalogBusy ||
                  catalogEditing ||
                  transactionBusy ||
                  sendConfigurationEditing
                }
                onChange={(event) => {
                  if (isEnvironment(event.target.value)) void changeEnvironment(event.target.value);
                }}
              >
                {!environment && <option value="">Sin verificar</option>}
                <option value="QA">QA</option>
                <option value="PREPROD">PREPROD</option>
              </select>
            </label>
            <span className="topbar-divider" />
            <span className="topbar-network">
              <span
                className={`status-dot ${link.connection?.state === 'CONNECTED' ? 'green' : ''}`}
              />{' '}
              {linkTitle}
            </span>
            <button
              className="topbar-connect"
              disabled={
                busy ||
                environment !== 'QA' ||
                transactionBusy ||
                link.pending ||
                catalogEditing ||
                sendConfigurationEditing
              }
              onClick={() =>
                void link.change(
                  link.connection?.state === 'CONNECTED' || link.connection?.state === 'CONNECTING'
                    ? 'disconnect'
                    : 'connect',
                )
              }
            >
              <Icon name="monitor" size={16} />
              {link.pending
                ? 'Conectando…'
                : link.connection?.state === 'CONNECTED' || link.connection?.state === 'CONNECTING'
                  ? 'Desconectar'
                  : 'Conectar'}
            </button>
          </div>
        </header>

        <main>
          {link.error && page !== 'dashboard' && (
            <p className="inline-error" role="alert">
              {link.error}
            </p>
          )}
          {environment === 'PREPROD' && (
            <div className="preprod-banner" role="status">
              <Icon name="shield" size={17} /> Ambiente PREPROD · Configuración y límites
              independientes de QA.
            </div>
          )}
          {error && (
            <div className="error-banner" role="alert">
              <div>
                <strong>{error.message}</strong>
                <details>
                  <summary>Detalle técnico</summary>
                  <code>{error.code}</code>
                </details>
              </div>
              <button onClick={() => void refresh()} disabled={busy}>
                Reintentar
              </button>
            </div>
          )}
          {page !== 'transactions' && page !== 'load' && (
            <div className="page-heading">
              <div>
                <h1>{page === 'dashboard' ? 'Inicio' : current?.label}</h1>
                {page === 'cards' && (
                  <p>Lee una tarjeta física y guarda una referencia para las pruebas QA.</p>
                )}
              </div>
            </div>
          )}

          {transactionSetup && ['entities', 'atms'].includes(page) && (
            <div className="transaction-setup-banner" role="status">
              <span>
                <Icon name="transaction" size={18} /> Configurar{' '}
                {page === 'entities' ? 'entidad' : 'ATM'} para tu transacción
              </span>
              <button disabled={catalogBusy || catalogEditing} onClick={goToTransactions}>
                Volver a transacción <Icon name="arrow" size={15} />
              </button>
            </div>
          )}

          {page === 'dashboard' && (
            <>
              <section className="metrics-grid" aria-label="Métricas de la estación">
                {[
                  {
                    label: 'Transacciones ejecutadas',
                    value: '0',
                    note: 'Sin ejecuciones todavía',
                    icon: 'transaction' as const,
                    color: 'blue',
                  },
                  {
                    label: 'Flujos MVP habilitados',
                    value: '0 / 5',
                    note: 'Pendientes de evidencia',
                    icon: 'check' as const,
                    color: 'green',
                  },
                  {
                    label: 'Conexión al Switch',
                    value: linkTitle,
                    note: link.connection?.endpoint
                      ? `${link.connection.endpoint.host}:${link.connection.endpoint.port}`
                      : 'Conecta desde el panel de enlace',
                    icon: 'monitor' as const,
                    color: 'amber',
                  },
                  {
                    label: 'Latencia end-to-end',
                    value: '—',
                    note: 'Disponible al ejecutar',
                    icon: 'clock' as const,
                    color: 'purple',
                  },
                ].map((metric) => (
                  <article className="metric-card" key={metric.label}>
                    <div className="metric-top">
                      <span>{metric.label}</span>
                      <span className={`metric-icon ${metric.color}`}>
                        <Icon name={metric.icon} size={18} />
                      </span>
                    </div>
                    <strong className={metric.value.length > 10 ? 'metric-text' : ''}>
                      {metric.value}
                    </strong>
                    <small>{metric.note}</small>
                  </article>
                ))}
              </section>
              <SwitchConnectionView
                connection={link.connection}
                error={link.error}
                pending={link.pending}
                disabled={
                  busy || environment !== 'QA' || transactionBusy || sendConfigurationEditing
                }
                endpoint={
                  snapshot?.networkEvidence.status === 'DOCUMENTED'
                    ? snapshot.networkEvidence.evidence.ingress
                    : undefined
                }
                onChange={(action) => void link.change(action)}
              />
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Preparar una transacción</h2>
                    <span className="pill neutral">Funcional</span>
                  </div>
                  <div className="new-transaction-action">
                    <button
                      className="primary"
                      disabled={busy || !snapshot}
                      onClick={goToTransactions}
                    >
                      Nueva transacción <Icon name="arrow" size={16} />
                    </button>
                    <span>Completa los datos, elige una tarjeta y revisa el resumen.</span>
                  </div>
                </section>
                <CardReaderView compact />
              </div>
              <div className="dashboard-grid bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Requisitos del primer flujo</h2>
                    <button className="text-button" onClick={() => setPage('settings')}>
                      Ver detalle <Icon name="arrow" size={14} />
                    </button>
                  </div>
                  <details className="section-details">
                    <summary>Ver requisitos pendientes</summary>
                    {blockerList()}
                  </details>
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Últimas transacciones</h2>
                    <span className="pill neutral">0 registros</span>
                  </div>
                  <div className="table-header">
                    <span>Hora</span>
                    <span>ATM</span>
                    <span>Transacción</span>
                    <span>Estado</span>
                  </div>
                  <div className="empty-state compact">
                    <span className="empty-icon">
                      <Icon name="history" size={27} />
                    </span>
                    <h3>Sin transacciones ejecutadas</h3>
                    <button className="text-button" onClick={goToTransactions}>
                      Preparar transacción <Icon name="arrow" size={15} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}

          <div hidden={page !== 'transactions'}>
            <TransactionWorkspace
              visible={page === 'transactions'}
              key={environment ?? 'unavailable'}
              snapshot={snapshot}
              catalog={catalog}
              catalogError={catalogError}
              loading={catalogBusy}
              disabled={busy || !snapshot}
              client={client}
              onRefresh={refreshCatalog}
              onReviewingChange={setTransactionBusy}
              onNavigate={navigateFromTransaction}
              pendingAtmSelection={pendingAtmSelection}
              onAtmSelectionApplied={() => setPendingAtmSelection(undefined)}
              onCatalogChange={setCatalog}
            />
          </div>

          {page === 'settings' && (
            <>
              <SendConfigurationView
                key={environment ?? 'unavailable'}
                environment={environment}
                client={client}
                disabled={busy || !snapshot}
                onEditingChange={setSendConfigurationEditing}
              />
              <NetworkEvidenceView state={snapshot?.networkEvidence} environment={environment} />
              <section className="panel settings-panel">
                <div className="panel-heading">
                  <h2>Estado de configuración</h2>
                  <span className="pill amber">{blockers.length} requisitos pendientes</span>
                </div>
                {blockerList()}
                <div className="document-note">
                  <Icon name="shield" size={20} />
                  <div>
                    <strong>Fuentes antes de implementar</strong>
                    <p>
                      Completa docs/INPUT_CHECKLIST.md con especificación oficial, diccionarios
                      aprobados y evidencia real de QA o PREPROD.
                    </p>
                  </div>
                </div>
              </section>
              <section className="panel audit-panel">
                <div className="panel-heading">
                  <h2>Cambios de ambiente</h2>
                  <span className="pill neutral">Auditoría local</span>
                </div>
                {snapshot?.audit.length ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha local</th>
                        <th>Cambio</th>
                        <th>Usuario</th>
                        <th>Equipo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.audit.slice(0, 10).map((entry) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.timestamp).toLocaleString('es-EC')}</td>
                          <td>
                            {entry.previousEnvironment} → {entry.environment}
                          </td>
                          <td>{entry.user}</td>
                          <td>{entry.machine}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="form-note">No hay cambios de ambiente registrados.</p>
                )}
              </section>
            </>
          )}

          {page === 'monitor' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Estación local</h2>
                <span className={`pill ${snapshot ? 'green' : 'amber'}`}>
                  {snapshot ? 'Activa' : 'No disponible'}
                </span>
              </div>
              <dl className="station-details">
                <div>
                  <dt>Equipo</dt>
                  <dd>{snapshot?.hostname ?? 'Sin verificar'}</dd>
                </div>
                <div>
                  <dt>ID del agente</dt>
                  <dd className="mono">{snapshot?.agentId ?? 'Sin verificar'}</dd>
                </div>
                <div>
                  <dt>Ambiente</dt>
                  <dd>{environment ?? 'Sin verificar'}</dd>
                </div>
                <div>
                  <dt>Control Plane</dt>
                  <dd>Sin configurar</dd>
                </div>
              </dl>
              <div className="document-note">
                <Icon name="monitor" />
                <div>
                  <strong>Monitoreo distribuido pendiente</strong>
                  <p>
                    El registro de estaciones, los heartbeats y las métricas en tiempo real
                    requieren implementar el Control Plane.
                  </p>
                </div>
              </div>
            </section>
          )}

          {['entities', 'atms'].includes(page) && (
            <CatalogView
              key={`${page}-${environment ?? 'unavailable'}`}
              kind={page === 'entities' ? 'entities' : 'atms'}
              environment={environment}
              catalog={catalog}
              loading={catalogBusy}
              disabled={busy || !snapshot}
              error={catalogError}
              onRefresh={refreshCatalog}
              onMutate={mutateCatalog}
              onEditingChange={setCatalogEditing}
              quickCreate={transactionSetup?.stage === page}
              initialEntityId={transactionSetup?.entityId}
              onCancelCreation={transactionSetup ? goToTransactions : undefined}
            />
          )}

          {page === 'history' && (
            <ObservationView
              key={environment ?? 'unavailable'}
              environment={environment}
              disabled={busy || !snapshot}
            />
          )}

          {page === 'cards' && snapshot?.environment && (
            <>
              <CardReaderView environment={snapshot.environment} />
              <details className="card-tools-foldout">
                <summary>Herramientas secundarias de QA</summary>
                <VirtualCardGeneratorView environment={snapshot.environment} />
              </details>
            </>
          )}
          {page === 'load' && (
            <LoadTestView
              key={environment ?? 'unavailable'}
              environment={environment}
              atms={catalog?.atms ?? []}
              disabled={busy || catalogBusy || transactionBusy || !snapshot}
              onPrepare={(request: LoadTestDraft) =>
                client.call<LoadTestPlan>((api) => api.prepareLoadTest(request))
              }
            />
          )}

          <footer className="main-footer">
            <span>Coonecta ATM Transaction Simulator</span>
            <span>
              <Icon name="shield" size={14} /> Uso exclusivo de QA y PREPROD
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
