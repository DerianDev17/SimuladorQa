import { useEffect, useRef, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import type { AppSnapshot, ErrorCode, Result } from '../../../../packages/shared/src/contracts';
import type { AtmProfile, CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { AtmOnboardingWizard } from './AtmOnboardingWizard';
import { SettingsView } from './SettingsView';
import type { SettingsPage } from './SettingsView';
import { CatalogView } from './CatalogView';
import { TransactionWorkspace } from './TransactionWorkspace';
import { ObservationView } from './ObservationView';
import type { CatalogMutation } from './CatalogView';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import { CardReaderView } from './CardReaderView';
import { connectionTitle, useSwitchConnection } from './SwitchConnectionView';
import { DashboardView } from './DashboardView';
import type { IconName } from './Icon';
import type { AtmSelection } from './transaction-setup';
import { LoadTestView } from './LoadTestView';
import { VirtualCardGeneratorView } from './VirtualCardGeneratorView';

const navigation: { id: string; label: string; icon: IconName; group: string }[] = [
  { id: 'dashboard', label: 'Inicio', icon: 'dashboard', group: 'ESTACIÓN DE PRUEBAS' },
  { id: 'transactions', label: 'Transacciones', icon: 'transaction', group: '' },
  { id: 'load', label: 'Carga y estrés', icon: 'load', group: '' },
  { id: 'atms', label: 'Perfiles ATM', icon: 'atm', group: 'CATÁLOGOS' },
  { id: 'cards', label: 'Tarjetas', icon: 'card', group: '' },
  { id: 'entities', label: 'Entidades', icon: 'entity', group: '' },
  { id: 'monitor', label: 'Monitor', icon: 'monitor', group: 'OBSERVABILIDAD' },
  { id: 'history', label: 'Observación', icon: 'history', group: '' },
  { id: 'settings', label: 'Configuración', icon: 'settings', group: '' },
];
const client = new DesktopClient(window.desktop);

export function App() {
  const [page, setPage] = useState('dashboard');
  const content = useRef<HTMLElement>(null);
  const previousPage = useRef(page);
  useEffect(() => {
    if (previousPage.current === page) return;
    previousPage.current = page;
    // Preserve a destination view's own focus (for example, a quick-create editor).
    if (!content.current?.contains(document.activeElement)) {
      content.current?.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [page]);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('environment');
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
  const [atmWizard, setAtmWizard] = useState<{ atm: AtmProfile | null }>();

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
        case 'createQaAtm':
          return api.createQaAtm(command.request);
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

  const environment = snapshot?.environment;
  const link = useSwitchConnection(client, environment);
  const linkTitle =
    environment === 'QA' ? connectionTitle(link.connection) : 'Conexión QA inactiva';
  const current = navigation.find((item) => item.id === page);
  const editingNotice = sendConfigurationEditing
    ? 'Guarda o descarta los cambios de envío para volver a navegar.'
    : catalogEditing
      ? atmWizard && page === 'atms'
        ? 'Finaliza el asistente o vuelve al catálogo para navegar. El ATM creado se conserva.'
        : 'Guarda o cancela la edición del catálogo para volver a navegar.'
      : undefined;

  function goToTransactions() {
    setTransactionSetup(undefined);
    setPage('transactions');
  }
  function navigateFromTransaction(next: 'entities' | 'atms' | 'settings' | 'history') {
    if (next === 'settings') setSettingsPage('send');
    if ((next === 'entities' || next === 'atms') && environment) {
      setTransactionSetup({ environment, stage: next });
    } else setTransactionSetup(undefined);
    setPage(next);
  }

  return (
    <div className="app-shell">
      <button className="skip-to-content" onClick={() => content.current?.focus()}>
        Ir al contenido
      </button>
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
                aria-label={item.label}
                title={item.label}
                aria-controls="main-content"
                aria-describedby={editingNotice ? 'navigation-editing-notice' : undefined}
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
            <span>Estación Qa</span>
            <span>v{snapshot?.version ?? '0.1.0'}</span>
          </div>
          <div className="sidebar-security">
            <Icon name="shield" size={15} /> Producción bloqueada
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span className="breadcrumb-parent">Operación</span>
            <span className="breadcrumb-separator" aria-hidden="true">
              /
            </span>
            <strong>{current?.label}</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment-label environment-badge" aria-label="Ambiente">
              {environment === 'QA' ? 'Qa' : 'Sin verificar'}
            </span>
            <span className="topbar-divider" />
            <span className="topbar-network" role="status" aria-live="polite">
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
                ? link.pendingAction === 'disconnect'
                  ? 'Desconectando…'
                  : 'Conectando…'
                : link.connection?.state === 'CONNECTED' || link.connection?.state === 'CONNECTING'
                  ? 'Desconectar'
                  : 'Conectar'}
            </button>
          </div>
        </header>

        <main id="main-content" ref={content} tabIndex={-1} aria-label={current?.label}>
          {editingNotice && (
            <p id="navigation-editing-notice" className="navigation-editing-notice" role="status">
              <Icon name="file" size={18} />
              {editingNotice}
            </p>
          )}
          {link.error && page !== 'dashboard' && (
            <p className="inline-error" role="alert">
              {link.error}
            </p>
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
          {!['dashboard', 'transactions', 'load', 'settings'].includes(page) && (
            <div className="page-heading">
              <div>
                <h1>{current?.label}</h1>
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
            <DashboardView
              key={environment ?? 'unavailable'}
              environment={environment}
              connection={link.connection}
              connectionError={link.error}
              busy={busy || !snapshot}
              onNewTransaction={goToTransactions}
            />
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
            <SettingsView
              key={environment ?? 'unavailable'}
              snapshot={snapshot}
              client={client}
              disabled={busy || !snapshot || transactionBusy}
              onEditingChange={setSendConfigurationEditing}
              page={settingsPage}
              onPageChange={setSettingsPage}
              editing={sendConfigurationEditing}
              catalog={catalog}
              catalogBusy={catalogBusy}
              catalogError={catalogError?.message}
              link={link}
              onRefreshCatalog={() => void refreshCatalog()}
              onNavigate={(destination) => {
                if (busy || transactionBusy || sendConfigurationEditing || catalogBusy) return;
                setTransactionSetup(undefined);
                setPage(destination);
              }}
            />
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

          {['entities', 'atms'].includes(page) && !(page === 'atms' && atmWizard) && (
            <CatalogView
              key={`${page}-${environment ?? 'unavailable'}`}
              kind={page === 'entities' ? 'entities' : 'atms'}
              environment={environment}
              catalog={catalog}
              loading={catalogBusy}
              disabled={busy || !snapshot || transactionBusy}
              error={catalogError}
              onRefresh={refreshCatalog}
              onMutate={mutateCatalog}
              onEditingChange={setCatalogEditing}
              quickCreate={transactionSetup?.stage === page}
              initialEntityId={transactionSetup?.entityId}
              onCancelCreation={transactionSetup ? goToTransactions : undefined}
              onCreateQaAtm={() => {
                setTransactionSetup(undefined);
                setAtmWizard({ atm: null });
              }}
              onVerifyQaAtm={(atm) => {
                setTransactionSetup(undefined);
                setAtmWizard({ atm });
              }}
            />
          )}

          {atmWizard && snapshot && (
            <div hidden={page !== 'atms'}>
              <AtmOnboardingWizard
                initialAtm={atmWizard.atm}
                visible={page === 'atms'}
                snapshot={snapshot}
                catalog={catalog}
                client={client}
                onCatalogChange={setCatalog}
                onRefresh={refreshCatalog}
                onEditingChange={setCatalogEditing}
                onTestingChange={setTransactionBusy}
                onSettings={() => {
                  setSettingsPage('send');
                  setPage('settings');
                }}
                onClose={() => setAtmWizard(undefined)}
              />
            </div>
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
              onBusyChange={setTransactionBusy}
            />
          )}

          <footer className="main-footer">
            <span>Coonecta ATM Transaction Simulator</span>
            <span>
              <Icon name="shield" size={14} /> Ambiente Qa
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
