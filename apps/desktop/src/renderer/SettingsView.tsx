import { dataBlockers } from '../../../../packages/domain/src/index';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import type { IconName } from './Icon';
import { NetworkEvidenceView } from './NetworkEvidenceView';
import { SendConfigurationView } from './SendConfigurationView';
import './settings.css';

const sections: { id: string; label: string; icon: IconName }[] = [
  { id: 'environment', label: 'Ambiente y estación', icon: 'monitor' },
  { id: 'send', label: 'Envío', icon: 'transaction' },
  { id: 'network', label: 'Evidencia de red', icon: 'database' },
  { id: 'requirements', label: 'Requisitos', icon: 'shield' },
  { id: 'audit', label: 'Auditoría', icon: 'history' },
];

export function SettingsView({
  snapshot,
  client,
  disabled,
  onEditingChange,
}: {
  snapshot: AppSnapshot | undefined;
  client: DesktopClient;
  disabled: boolean;
  onEditingChange(value: boolean): void;
}) {
  const environment = snapshot?.environment;
  const blockers = snapshot?.blockers ?? dataBlockers;
  const documented =
    snapshot?.networkEvidence.status === 'DOCUMENTED' &&
    snapshot.networkEvidence.evidence.environment === environment;
  return (
    <div className="settings-workspace">
      <header className="settings-heading">
        <div>
          <span className="settings-eyebrow">PREFERENCIAS DE LA ESTACIÓN</span>
          <h1>Configuración</h1>
          <p>Prepara tu ambiente de pruebas y consulta su configuración local.</p>
        </div>
        <span className="settings-scope">
          <Icon name="shield" size={17} /> Uso exclusivo de QA y PREPROD
        </span>
      </header>

      <div className="settings-layout">
        <aside className="settings-sidebar">
          <nav aria-label="Secciones de configuración">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#settings-${section.id}`}
                onClick={(event) => {
                  // Preserve the document URL validated by Electron's IPC sender guard.
                  event.preventDefault();
                  const target = document.getElementById(`settings-${section.id}`);
                  target?.focus({ preventScroll: true });
                  target?.scrollIntoView({ block: 'start' });
                }}
              >
                <Icon name={section.icon} size={18} />
                {section.label}
              </a>
            ))}
          </nav>
          <div className="settings-sidebar-note">
            <Icon name="shield" size={20} />
            <strong>Producción bloqueada</strong>
            <p>Los ajustes se aplican al ambiente seleccionado. QA y PREPROD son independientes.</p>
          </div>
        </aside>

        <div className="settings-content">
          <section
            id="settings-environment"
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
                {environment ?? 'Sin verificar'}
              </span>
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
              <Icon name="monitor" size={16} /> Cambia el ambiente desde el selector de la barra
              superior.
            </p>
          </section>

          <div id="settings-send" tabIndex={-1}>
            <SendConfigurationView
              environment={environment}
              client={client}
              disabled={disabled}
              onEditingChange={onEditingChange}
            />
          </div>

          <div id="settings-network" tabIndex={-1}>
            <NetworkEvidenceView state={snapshot?.networkEvidence} environment={environment} />
          </div>

          <section
            id="settings-requirements"
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
                        <td aria-label={`${entry.previousEnvironment} → ${entry.environment}`}>
                          <span className="settings-audit-transition">
                            {entry.previousEnvironment}
                            <Icon name="arrow" size={14} />
                            {entry.environment}
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
                  <p>Cuando cambies entre QA y PREPROD, aparecerá el registro aquí.</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
