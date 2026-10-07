import type { Environment } from '../../../../packages/domain/src/index';
import type { NetworkEvidenceSnapshot } from '../../../../packages/domain/src/network-evidence';

export function NetworkEvidenceView({
  state,
  environment,
}: {
  state: NetworkEvidenceSnapshot | undefined;
  environment: Environment | undefined;
}) {
  const evidence =
    state?.status === 'DOCUMENTED' && state.evidence.environment === environment
      ? state.evidence
      : undefined;
  return (
    <section className="panel network-evidence-view" aria-label="Evidencia de red del Switch">
      <div className="panel-heading">
        <h2>Destino ATM documentado</h2>
        <span className="pill amber">Sin conexión comprobada</span>
      </div>
      {evidence ? (
        <>
          <p>
            Simulador ATM → Switch/SmartVista → Mediator → Core → respuesta. Entidad{' '}
            {evidence.entityId} · {evidence.environment}.
          </p>
          <dl className="station-details">
            <div>
              <dt>Entrada ATM del Switch</dt>
              <dd>
                {evidence.ingress.host}:{evidence.ingress.port}
              </dd>
            </div>
            <div>
              <dt>Enlace observado hacia Mediator</dt>
              <dd>
                {evidence.downstream.host}:{evidence.downstream.remotePort} · puerto local del
                Switch {evidence.downstream.localPort}
              </dd>
            </div>
            <div>
              <dt>Remoto configurado en el PID</dt>
              <dd>{evidence.observedPeer}</dd>
            </div>
            <div>
              <dt>Origen del simulador</dt>
              <dd>
                {evidence.simulatorOrigin === 'WORKSTATION'
                  ? 'Esta PC; acceso desde su IP pendiente de validar'
                  : 'Equipo de cajeros; acceso pendiente de validar'}
              </dd>
            </div>
            <div>
              <dt>Interfaz observada</dt>
              <dd>
                PID {evidence.networkInterface.id} · {evidence.networkInterface.protocolLabel} ·{' '}
                {evidence.networkInterface.formatLabel}
              </dd>
            </div>
            <div>
              <dt>Longitud de encabezado configurada</dt>
              <dd>
                {evidence.networkInterface.configuredHeaderLength} · codificación y significado
                pendientes
              </dd>
            </div>
            <div>
              <dt>Iniciador configurado</dt>
              <dd>
                {evidence.networkInterface.initiator} · keep alive{' '}
                {evidence.networkInterface.keepAliveEnabled ? 'habilitado' : 'deshabilitado'};
                intervalo pendiente
              </dd>
            </div>
          </dl>
          <div className="document-note">
            <div>
              <strong>Validar antes del envío</strong>
              <p>
                Acceso del simulador al PID, framing y diccionario ISO, TLS, timeout y política de
                conexiones. La conexión de los cajeros observada en la captura no prueba la conexión
                de esta PC.
              </p>
            </div>
          </div>
          <small>
            Fuente documental recibida: {new Date(evidence.recordedAt).toLocaleString('es-EC')}. ID
            de evidencia {evidence.id}.
          </small>
        </>
      ) : (
        <p role={state?.status === 'UNAVAILABLE' ? 'alert' : 'status'}>
          {state?.status === 'UNAVAILABLE'
            ? 'No se pudo validar la evidencia local de red. Revisa su formato y permisos.'
            : `No hay evidencia de red cargada para ${environment ?? 'el ambiente sin verificar'}.`}
        </p>
      )}
    </section>
  );
}
