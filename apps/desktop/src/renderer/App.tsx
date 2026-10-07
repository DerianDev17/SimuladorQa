import { useEffect, useState } from 'react';
import {
  dataBlockers,
  isEnvironment,
  scenarios,
  transactions,
} from '../../../../packages/domain/src/index';
import type {
  Environment,
  Preparation,
  Scenario,
  TransactionType,
} from '../../../../packages/domain/src/index';
import type { AppSnapshot, ErrorCode, Result } from '../../../../packages/shared/src/contracts';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { CatalogView } from './CatalogView';
import type { CatalogMutation } from './CatalogView';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const navigation: { id: string; label: string; icon: IconName; group: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', group: 'ESTACIÓN DE PRUEBAS' },
  { id: 'transactions', label: 'Transacciones', icon: 'transaction', group: '' },
  { id: 'atms', label: 'Perfiles ATM', icon: 'atm', group: '' },
  { id: 'entities', label: 'Entidades', icon: 'entity', group: '' },
  { id: 'cards', label: 'Tarjetas', icon: 'card', group: '' },
  { id: 'load', label: 'Carga y estrés', icon: 'load', group: '' },
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
  const [transaction, setTransaction] = useState<TransactionType>('BALANCE');
  const [scenario, setScenario] = useState<Scenario>('LOCAL');
  const [preparation, setPreparation] = useState<Preparation>();
  const [catalog, setCatalog] = useState<CatalogSnapshot>();
  const [catalogError, setCatalogError] = useState<{ code: ErrorCode; message: string }>();
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogEditing, setCatalogEditing] = useState(false);

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
      }
    });
    if (result.ok) {
      setCatalog(result.value);
      setPreparation(undefined);
    } else setCatalogError(result.error);
    setCatalogBusy(false);
    return result.ok;
  }

  async function refresh() {
    setBusy(true);
    applySnapshot(await client.call((api) => api.getSnapshot()));
  }

  async function changeEnvironment(environment: Environment) {
    setBusy(true);
    setPreparation(undefined);
    const result = await client.call((api) => api.setEnvironment(environment));
    if (!result.ok && result.error.code === 'TIMEOUT') {
      // Un timeout IPC no cancela una escritura ya iniciada. Reconciliar con Main.
      applySnapshot(await client.call((api) => api.getSnapshot()));
      setError(result.error);
    } else {
      applySnapshot(result);
    }
  }

  async function prepare() {
    setBusy(true);
    setPreparation(undefined);
    const result = await client.call((api) => api.prepareTransaction({ transaction, scenario }));
    if (result.ok) {
      setPreparation(result.value);
      setError(undefined);
    } else {
      setError(result.error);
    }
    setBusy(false);
  }

  const environment = snapshot?.environment;
  const current = navigation.find((item) => item.id === page);
  const blockers = snapshot?.blockers ?? dataBlockers;

  function goToTransactions() {
    setPage('transactions');
  }

  function blockerList() {
    return (
      <div className="blocker-list">
        {blockers.map((blocker, index) => (
          <div className="blocker" key={blocker.id}>
            <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{blocker.label}</strong>
              <p>{blocker.description}</p>
            </div>
            <span className="pill amber">Pendiente</span>
          </div>
        ))}
      </div>
    );
  }

  function transactionForm() {
    return (
      <>
        <div className="form-grid">
          <label>
            Escenario
            <select
              value={scenario}
              disabled={busy}
              onChange={(event) => {
                const selected = scenarios.find((item) => item.id === event.target.value);
                if (selected) {
                  setScenario(selected.id);
                  setPreparation(undefined);
                }
              }}
            >
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Transacción
            <select
              value={transaction}
              disabled={busy}
              onChange={(event) => {
                const selected = transactions.find((item) => item.id === event.target.value);
                if (selected) {
                  setTransaction(selected.id);
                  setPreparation(undefined);
                }
              }}
            >
              {transactions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Perfil ATM
            <select disabled aria-label="Perfil ATM">
              <option>
                {catalog?.atms.length
                  ? `${catalog.atms.length} perfiles en borrador`
                  : 'Sin perfiles validados'}
              </option>
            </select>
          </label>
          <label>
            Tarjeta de prueba
            <select disabled aria-label="Tarjeta de prueba">
              <option>Sin tarjetas validadas</option>
            </select>
          </label>
        </div>
        <p className="form-note">{scenarios.find((item) => item.id === scenario)?.description}</p>
        <div className="form-actions">
          <button className="primary" onClick={() => void prepare()} disabled={busy || !snapshot}>
            Revisar requisitos <Icon name="arrow" size={16} />
          </button>
          <button disabled title="Requiere evidencia y perfiles validados">
            Enviar transacción
          </button>
        </div>
        {preparation && (
          <div className="preparation" role="status">
            <strong>Envío bloqueado · {preparation.environment}</strong>
            <p>
              Faltan {preparation.blockers.length} grupos de requisitos. No se ha enviado ninguna
              trama.
            </p>
            <span className="source">Especificación: {preparation.specification}</span>
          </div>
        )}
      </>
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
            <small>ATM Transaction Simulator</small>
          </div>
        </div>
        <div className="workspace">
          <span className="workspace-icon">QA</span>
          <div>
            <strong>Laboratorio de pruebas</strong>
            <small>Estación local</small>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <nav aria-label="Navegación principal">
          {navigation.map((item) => (
            <div key={item.id}>
              {item.group && <p className="nav-group">{item.group}</p>}
              <button
                className={`nav-item ${page === item.id ? 'active' : ''}`}
                aria-current={page === item.id ? 'page' : undefined}
                onClick={() => setPage(item.id)}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.id === 'transactions' && <span className="nav-count">5</span>}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-status">
            <span className={`status-dot ${snapshot ? 'green' : ''}`} />
            {snapshot
              ? 'Servicios locales activos'
              : busy
                ? 'Iniciando servicios…'
                : 'Servicios no disponibles'}
          </div>
          <span>
            v{snapshot?.version ?? '0.1.0'} <span className="version-separator">·</span> MVP 1
          </span>
          <div className="sidebar-security">
            <Icon name="shield" size={15} /> Producción bloqueada
          </div>
        </div>
      </aside>

      <div className={`main-area ${environment === 'PREPROD' ? 'preprod' : ''}`}>
        <header className="topbar">
          <div className="breadcrumb">
            Estación QA <span>/</span> <strong>{current?.label}</strong>
          </div>
          <div className="topbar-actions">
            <label className="environment-label">
              Ambiente
              <select
                aria-label="Ambiente"
                value={environment ?? ''}
                disabled={busy || !snapshot || catalogBusy || catalogEditing}
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
            <div className="user-avatar">QA</div>
          </div>
        </header>

        <main>
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
          <div className="page-heading">
            <div>
              <span className="eyebrow">COONECTA / {environment ?? 'AMBIENTE SIN VERIFICAR'}</span>
              <h1>{page === 'dashboard' ? 'Tu estación de pruebas' : current?.label}</h1>
              <p>
                {page === 'dashboard'
                  ? 'Prepara, ejecuta y observa tus pruebas ATM desde un solo lugar.'
                  : page === 'transactions'
                    ? 'Selecciona el flujo y verifica sus requisitos antes de enviar.'
                    : 'Información y estado de tu laboratorio de QA.'}
              </p>
            </div>
            <span className="pill outline">
              <span className="status-dot" />
              {snapshot ? 'Configuración inicial' : 'Servicios sin verificar'}
            </span>
          </div>

          {page === 'dashboard' && (
            <>
              <section className="intro-card">
                <div>
                  <span className="intro-label">
                    <span className="status-dot blue" /> PRIMEROS PASOS
                  </span>
                  <h2>Todo listo para empezar a configurar.</h2>
                  <p>
                    La estación está preparada. Añade la evidencia del proyecto y los perfiles de
                    prueba para habilitar el primer flujo real.
                  </p>
                  <button className="primary" onClick={() => setPage('settings')}>
                    Ver configuración pendiente <Icon name="arrow" size={16} />
                  </button>
                </div>
                <div className="intro-visual" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="visual-node node-one">
                    <Icon name="atm" size={22} />
                  </div>
                  <div className="visual-center">
                    <Icon name="transaction" size={34} />
                  </div>
                  <div className="visual-node node-two">
                    <Icon name="shield" size={22} />
                  </div>
                  <span className="visual-caption">ATM → Switch → Core</span>
                </div>
              </section>
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
                    value: 'Sin configurar',
                    note: 'Endpoint pendiente',
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
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Preparar una transacción</h2>
                    <span className="pill neutral">Funcional</span>
                  </div>
                  {transactionForm()}
                </section>
                <section className="panel reader-panel">
                  <div className="panel-heading">
                    <h2>Lector de tarjetas</h2>
                    <span className="pill neutral">Sin configurar</span>
                  </div>
                  <div className="reader-content">
                    <div className="reader-illustration">
                      <Icon name="reader" size={78} />
                    </div>
                    <div>
                      <h3>HID OMNIKEY 5422</h3>
                      <p>
                        La integración PC/SC requiere validar el lector y la tarjeta en esta
                        estación.
                      </p>
                      <span className="reader-info">
                        <span className="status-dot" /> Hardware sin verificar
                      </span>
                    </div>
                  </div>
                  <div className="reader-footer">
                    <Icon name="shield" size={16} />
                    <span>Los datos de tarjeta se mostrarán enmascarados.</span>
                  </div>
                </section>
              </div>
              <div className="dashboard-grid bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Requisitos del primer flujo</h2>
                    <button className="text-button" onClick={() => setPage('settings')}>
                      Ver detalle <Icon name="arrow" size={14} />
                    </button>
                  </div>
                  {blockerList()}
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
                    <h3>Tu primera prueba empieza aquí</h3>
                    <p>Las ejecuciones y su evidencia aparecerán en este espacio.</p>
                    <button className="text-button" onClick={goToTransactions}>
                      Preparar transacción <Icon name="arrow" size={15} />
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}

          {page === 'transactions' && (
            <div className="transaction-layout">
              <section className="panel">
                <div className="panel-heading">
                  <h2>Contexto de la prueba</h2>
                  <span className="pill blue">{environment ?? 'Sin verificar'}</span>
                </div>
                {transactionForm()}
                <div className="timeline">
                  <span>ATM</span>
                  <Icon name="arrow" size={16} />
                  <span>Switch Coonecta</span>
                  <Icon name="arrow" size={16} />
                  <span>Core</span>
                </div>
                <p className="form-note">
                  No hay request ni response ISO hasta habilitar una ejecución real.
                </p>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Requisitos de envío</h2>
                  <span className="pill amber">Bloqueado</span>
                </div>
                {blockerList()}
              </section>
              <section className="panel inspector">
                <div className="panel-heading">
                  <h2>Inspector ISO</h2>
                  <span className="pill neutral">Sin mensaje</span>
                </div>
                <div className="empty-state compact">
                  <Icon name="transaction" size={30} />
                  <h3>Esperando una ejecución</h3>
                  <p>
                    Las vistas parseada, ASCII y HEX se habilitarán con el motor ISO y sus reglas
                    validadas.
                  </p>
                </div>
              </section>
            </div>
          )}

          {page === 'settings' && (
            <>
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
            />
          )}

          {['cards', 'load', 'history'].includes(page) && (
            <section className="panel">
              <div className="empty-state">
                <span className="empty-icon">
                  <Icon name={current?.icon ?? 'dashboard'} size={36} />
                </span>
                <span className="eyebrow">
                  {page === 'load' ? 'GATE FUNCIONAL' : 'ESTACIÓN LOCAL'}
                </span>
                <h2>
                  {page === 'cards'
                    ? 'Aún no hay tarjetas de prueba'
                    : page === 'load'
                      ? 'Primero, valida los flujos funcionales'
                      : 'Aún no hay ejecuciones'}
                </h2>
                <p>
                  {page === 'cards'
                    ? 'Se requiere el catálogo validado y el almacenamiento cifrado antes de guardar datos sensibles.'
                    : page === 'load'
                      ? 'La carga requiere que los cinco flujos MVP pasen pruebas deterministas y que existan límites autorizados por ambiente.'
                      : 'El historial estará disponible cuando el motor transaccional pueda generar evidencia real.'}
                </p>
                <button
                  className="primary"
                  onClick={() => setPage(page === 'history' ? 'transactions' : 'settings')}
                >
                  {page === 'history' ? 'Preparar transacción' : 'Ver requisitos pendientes'}
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </section>
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
