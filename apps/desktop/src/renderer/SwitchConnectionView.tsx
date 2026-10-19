import { useEffect, useRef, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import type {
  SwitchConnectionSnapshot,
  SwitchDisconnectReason,
} from '../../../../packages/domain/src/switch-connection';
import type { DesktopClient } from './desktop-client';

export function connectionTitle(connection?: SwitchConnectionSnapshot): string {
  return connection?.state === 'CONNECTED'
    ? 'TCP conectado'
    : connection?.state === 'CONNECTING'
      ? 'Conectando…'
      : connection
        ? connection.reason === 'TRANSACTION_STARTED'
          ? 'Transacción en curso'
          : 'Desconectado'
        : 'Sin comprobar';
}

export function useSwitchConnection(client: DesktopClient, environment?: Environment) {
  const [connection, setConnection] = useState<SwitchConnectionSnapshot>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    const ticket = ++generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setConnection(undefined);
    setError(undefined);
    setPending(false);
    async function poll() {
      const result = await client.call((api) => api.getSwitchConnection('QA'));
      if (ticket !== generation.current) return;
      if (result.ok)
        setConnection((previous) =>
          !previous || result.value.observedAt >= previous.observedAt ? result.value : previous,
        );
      else {
        setConnection(undefined);
        setError(result.error.message);
      }
      timer = setTimeout(() => void poll(), 1000);
    }
    if (environment === 'QA') void poll();
    return () => {
      generation.current++;
      clearTimeout(timer);
    };
  }, [client, environment]);

  async function change(action: 'connect' | 'disconnect') {
    if (environment !== 'QA' || pending) return;
    const ticket = generation.current;
    setPending(true);
    setError(undefined);
    const result = await client.call((api) =>
      action === 'connect' ? api.connectSwitch('QA') : api.disconnectSwitch('QA'),
    );
    if (ticket !== generation.current) return;
    if (result.ok)
      setConnection((previous) =>
        !previous || result.value.observedAt >= previous.observedAt ? result.value : previous,
      );
    else setError(result.error.message);
    setPending(false);
  }
  return { connection, error, pending, change };
}

const reasons: Record<SwitchDisconnectReason, string> = {
  USER_DISCONNECTED: 'Desconectado por el operador.',
  ENVIRONMENT_CHANGED: 'Conexión cerrada al cambiar de ambiente.',
  APP_CLOSED: 'La aplicación cerró la conexión.',
  TRANSACTION_STARTED: 'Envío en curso. La conexión de observación se restablecerá al terminar.',
  PEER_CLOSED: 'El servidor cerró la conexión.',
  CONNECT_TIMEOUT: 'El destino no respondió dentro del plazo de conexión.',
  REFUSED: 'El destino rechazó la conexión TCP.',
  UNREACHABLE: 'El destino no es accesible desde esta estación.',
  PERMISSION: 'El sistema impidió abrir la conexión.',
  SOCKET_ERROR: 'Se interrumpió la comunicación TCP.',
  ADMISSION_DENIED: 'El Switch rechazó el acceso de esta estación.',
  UNSUPPORTED_FRAME: 'Se recibió un mensaje fuera del perfil de gestión soportado.',
  RECEIVE_LIMIT: 'Conexión cerrada por exceder el límite de recepción.',
};

export function SwitchConnectionView({
  connection,
  error,
  pending,
  disabled,
  endpoint,
  onChange,
}: {
  connection?: SwitchConnectionSnapshot | undefined;
  error?: string | undefined;
  pending: boolean;
  disabled: boolean;
  endpoint?: { host: string; port: number } | undefined;
  onChange(action: 'connect' | 'disconnect'): void;
}) {
  const active = connection?.state === 'CONNECTED' || connection?.state === 'CONNECTING';
  const destination = connection?.endpoint ?? endpoint;
  return (
    <section className="switch-connection-panel" aria-label="Conexión al Switch">
      <div>
        <h2>Conexión al Switch</h2>
        <p role="status">
          <span className={`status-dot ${connection?.state === 'CONNECTED' ? 'green' : ''}`} />{' '}
          {connectionTitle(connection)}
          {destination && (
            <>
              {' '}
              · {destination.host}:{destination.port}
            </>
          )}
        </p>
        {connection?.state === 'CONNECTED' && connection.localEndpoint && (
          <p>
            Origen: {connection.localEndpoint.address}:{connection.localEndpoint.port}
          </p>
        )}
        {connection?.networkMessage && (
          <p>
            Gestión recibida: {connection.networkMessage.mti}/{connection.networkMessage.code} ·{' '}
            {new Date(connection.networkMessage.receivedAt).toLocaleTimeString('es-EC')}
          </p>
        )}
        {connection?.reason && <p>{reasons[connection.reason]}</p>}
        {error && <p role="alert">{error}</p>}
        <small>
          El estado corresponde a la conexión TCP. La disponibilidad de una consulta se revisa en
          Transacciones.
        </small>
      </div>
      <button
        className="button secondary"
        disabled={disabled || pending}
        onClick={() => onChange(active ? 'disconnect' : 'connect')}
      >
        {pending ? 'Procesando…' : active ? 'Desconectar' : 'Conectar al Switch'}
      </button>
    </section>
  );
}
