import { dataBlockers } from '../../../../packages/domain/src/index';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { NetworkEvidenceView } from './NetworkEvidenceView';
import { SendConfigurationView } from './SendConfigurationView';
import { SwitchConnectionView } from './SwitchConnectionView';
import type { useSwitchConnection } from './SwitchConnectionView';
import { SettingsReaderStatus } from './SettingsReaderStatus';
import './settings.css';

export type SettingsPage =
  'environment' | 'send' | 'operations' | 'network' | 'requirements' | 'audit';

const sections: { id: SettingsPage; label: string; icon: IconName }[] = [
  { id: 'environment', label: 'Ambiente y estación', icon: 'monitor' },
  { id: 'send', label: 'Envío', icon: 'transaction' },
  { id: 'operations', label: 'Dispositivos y perfiles', icon: 'reader' },
  { id: 'network', label: 'Evidencia de red', icon: 'database' },
  { id: 'requirements', label: 'Requisitos', icon: 'shield' },
  { id: 'audit', label: 'Auditoría', icon: 'history' },
];

export type SettingsDestination =
  'atms' | 'entities' | 'cards' | 'load' | 'transactions' | 'history';

export function SettingsView({
  snapshot,
  client,
  disabled,
  onEditingChange,
  editing,
  catalog,
  catalogBusy,
  catalogError,
  link,
  onNavigate,
  onRefreshCatalog,
  page,
  onPageChange,
}: {
  snapshot: AppSnapshot | undefined;
  client: DesktopClient;
  disabled: boolean;
  onEditingChange(value: boolean): void;
  editing: boolean;
  catalog: CatalogSnapshot | undefined;
  catalogBusy: boolean;
  catalogError: string | undefined;
  link: ReturnType<typeof useSwitchConnection>;
  onNavigate(destination: SettingsDestination): void;
  onRefreshCatalog(): void;
  page: SettingsPage;
  onPageChange(page: SettingsPage): void;
}) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    content.current?.focus({ preventScroll: true });
  }, [page]);
  const environment = snapshot?.environment;
  const blockers = snapshot?.blockers ?? dataBlockers;
  const documented =
    snapshot?.networkEvidence.status === 'DOCUMENTED' &&
    snapshot.networkEvidence.evidence.environment === environment;
  const actionDisabled = disabled || editing || catalogBusy || link.pending;
  const currentCatalog = catalog?.environment === environment ? catalog : undefined;
  const activeAtms = currentCatalog?.atms.filter(
    (atm) =>
      atm.active &&
      currentCatalog.entities.some((entity) => entity.id === atm.entityId && entity.active),
  ).length;
  return (
    <div className="settings-workspace">
      <header className="settings-heading">
        <div>
          <span className="settings-eyebrow">PREFERENCIAS DE LA ESTACIÓN</span>
          <h1>Configuración</h1>
          <p>Ajusta los plazos, los dispositivos y las herramientas de tu estación.</p>
        </div>
        <span className="settings-scope">
          <Icon name="shield" size={17} /> Ambiente Qa
        </span>
      </header>

      <div className="settings-layout">
        <aside className="settings-sidebar">
          <nav aria-label="Páginas de configuración">
            {sections.map((section) => (
              <button
                key={section.id}
                aria-current={page === section.id ? 'page' : undefined}
                aria-controls={`settings-${section.id}`}
                disabled={editing && page !== section.id}
                onClick={() => {
                  if (!editing) onPageChange(section.id);
                }}
              >
                <Icon name={section.icon} size={18} />
                {section.label}
              </button>
            ))}
          </nav>
          <div className="settings-sidebar-note">
            <Icon name="shield" size={20} />
            <strong>Producción bloqueada</strong>
            <p>Qa es el único ambiente de trabajo de esta estación.</p>
          </div>
        </aside>

        <div
          className="settings-content"
          ref={content}
          tabIndex={-1}
          role="region"
          aria-label={`Página de configuración: ${sections.find((section) => section.id === page)?.label}`}
        >
          <section
            id="settings-environment"
            hidden={page !== 'environment'}
            tabIndex={-1}
            className="panel settings-environment"
            aria-label="Ambiente y estación"
          >
            <div className="panel-heading">
              <div>
                <h2>Ambiente y estación</h2>
                <p>Contexto actual de esta instalación.</p>
              </div>
              <span className={`pill ${environment === 'QA' ? 'blue' : 'amber'}`}>
                {environment === 'QA' ? 'Qa' : 'Sin verificar'}
              </span>
            </div>
            <div className="settings-environment-fixed">
              <strong>Qa</strong>
              <span>Ambiente único · Pruebas del simulador</span>
            </div>
            <dl className="settings-overview">
              <div>
                <dt>Estación</dt>
                <dd>{snapshot?.hostname ?? 'Sin verificar'}</dd>
              </div>
              <div>
                <dt>Versión instalada</dt>
                <dd>{snapshot ? `v${snapshot.version}` : 'Sin verificar'}</dd>
              </div>
              <div>
                <dt>Evidencia de red</dt>
                <dd>
                  {documented
                    ? 'Documentada'
                    : snapshot?.networkEvidence.status === 'UNAVAILABLE'
                      ? 'No disponible'
                      : 'Sin documentar'}
                </dd>
              </div>
            </dl>
            <p className="settings-context-note">
              <Icon name="shield" size={16} /> Los ajustes, perfiles y operaciones de esta estación
              se utilizan en Qa.
            </p>
          </section>

          <div
            id="settings-operations"
            hidden={page !== 'operations'}
            tabIndex={-1}
            className="settings-operations"
          >
            {environment === 'QA' ? (
              <SwitchConnectionView
                connection={link.connection}
                error={link.error}
                pending={link.pending}
                disabled={actionDisabled}
                onChange={(action) => void link.change(action)}
              />
            ) : (
              <section className="panel" aria-label="Conexión al Switch">
                <h2>Conexión al Switch</h2>
                <p className="settings-context-note">
                  El servicio local todavía no ha confirmado el ambiente Qa.
                </p>
              </section>
            )}
            <SettingsReaderStatus
              client={client}
              disabled={actionDisabled}
              onOpen={() => onNavigate('cards')}
            />
            <section className="panel settings-profiles" aria-label="Perfiles y herramientas">
              <div className="panel-heading">
                <div>
                  <h2>Perfiles y herramientas</h2>
                  <p>Administra los datos usados por el simulador.</p>
                </div>
              </div>
              {catalogError && (
                <p className="inline-error" role="alert">
                  {catalogError}
                </p>
              )}
              <p className="settings-profile-count">
                {catalogBusy
                  ? 'Consultando perfiles…'
                  : activeAtms !== undefined
                    ? `${activeAtms} ATM ${activeAtms === 1 ? 'activo' : 'activos'} con entidad activa en ${environment}`
                    : 'Catálogo sin verificar'}
              </p>
              <div className="settings-tool-list">
                <button disabled={actionDisabled} onClick={() => onNavigate('atms')}>
                  <Icon name="atm" />
                  <span>
                    <strong>Administrar perfiles ATM</strong>
                    <small>Terminal, adquirente y entidad</small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
                <button disabled={actionDisabled} onClick={() => onNavigate('entities')}>
                  <Icon name="entity" />
                  <span>
                    <strong>Administrar entidades</strong>
                    <small>Entidades usadas por los perfiles ATM</small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
                <button disabled={actionDisabled} onClick={() => onNavigate('load')}>
                  <Icon name="load" />
                  <span>
                    <strong>Configurar carga y estrés</strong>
                    <small>ATM, ritmo, límites y presets</small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
                <button disabled={actionDisabled} onClick={() => onNavigate('history')}>
                  <Icon name="history" />
                  <span>
                    <strong>Consultar evidencia Mediator</strong>
                    <small>Observación e historial remoto</small>
                  </span>
                  <Icon name="arrow" size={16} />
                </button>
              </div>
              <div className="settings-operational-actions">
                <button disabled={actionDisabled} onClick={onRefreshCatalog}>
                  Actualizar perfiles
                </button>
                <button disabled={actionDisabled} onClick={() => onNavigate('transactions')}>
                  Ir a Transacciones <Icon name="arrow" size={14} />
                </button>
              </div>
            </section>
          </div>

          <div id="settings-send" hidden={page !== 'send'} tabIndex={-1}>
            <SendConfigurationView
              environment={environment}
              client={client}
              disabled={disabled}
              onEditingChange={onEditingChange}
            />
          </div>

          <div id="settings-network" hidden={page !== 'network'} tabIndex={-1}>
            <NetworkEvidenceView state={snapshot?.networkEvidence} environment={environment} />
          </div>

          <section
            id="settings-requirements"
            hidden={page !== 'requirements'}
            tabIndex={-1}
            className="panel settings-requirements"
            aria-label="Requisitos de configuración"
          >
            <div className="panel-heading">
              <div>
                <h2>Estado de configuración</h2>
                <p>Fuentes y validaciones pendientes del proyecto.</p>
              </div>
              <span className={`pill ${blockers.length ? 'amber' : 'neutral'}`}>
                {blockers.length} requisitos pendientes
              </span>
            </div>
            <div className="settings-requirement-list">
              {blockers.map((blocker) => (
                <details key={blocker.id}>
                  <summary>
                    <Icon name="file" size={17} />
                    <span>{blocker.label}</span>
                    <span className="settings-pending">Pendiente</span>
                  </summary>
                  <p>{blocker.description}</p>
                </details>
              ))}
            </div>
            <p className="settings-context-note">
              Cada operación valida sus propios requisitos antes de ejecutarse.
            </p>
          </section>

          <section
            id="settings-audit"
            hidden={page !== 'audit'}
            tabIndex={-1}
            className="panel settings-audit"
            aria-label="Auditoría de ambientes"
          >
            <div className="panel-heading">
              <div>
                <h2>Cambios de ambiente</h2>
                <p>Últimos 10 cambios registrados en esta estación.</p>
              </div>
              <span className="pill neutral">Auditoría local</span>
            </div>
            {snapshot?.audit.length ? (
              <div className="settings-table-scroll">
                <table>
                  <caption className="visually-hidden">
                    Cambios de ambiente con fecha local, usuario y equipo
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha local</th>
                      <th scope="col">Cambio</th>
                      <th scope="col">Usuario</th>
                      <th scope="col">Equipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.audit.slice(0, 10).map((entry) => (
                      <tr key={entry.id}>
                        <td>{new Date(entry.timestamp).toLocaleString('es-EC')}</td>
                        <td
                          aria-label={`${entry.previousEnvironment === 'QA' ? 'Qa' : 'Configuración anterior'} → ${entry.environment === 'QA' ? 'Qa' : 'Configuración anterior'}`}
                        >
                          <span className="settings-audit-transition">
                            {entry.previousEnvironment === 'QA' ? 'Qa' : 'Configuración anterior'}
                            <Icon name="arrow" size={14} />
                            {entry.environment === 'QA' ? 'Qa' : 'Configuración anterior'}
                          </span>
                        </td>
                        <td>{entry.user}</td>
                        <td>{entry.machine}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="settings-empty">
                <Icon name="history" size={26} />
                <div>
                  <strong>No hay cambios de ambiente registrados.</strong>
                  <p>Aquí se conservan los cambios históricos de configuración.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useRef } from 'react';
