import { Component, useState } from 'react';
import type { ReactNode } from 'react';
import { DesktopClient } from './desktop-client';
import { App } from './App';
import type { RendererRecoveryStatus } from '../../../../packages/shared/src/contracts';

const recoveryClient = new DesktopClient(window.desktop);

function Recovery({ restore }: { restore: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<RendererRecoveryStatus>();
  async function inspect(restoreWhenIdle: boolean) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    const result = await recoveryClient.call(
      (api) => api.getRendererRecovery(),
      5000,
      'No se pudo comprobar el estado a tiempo. Consulta nuevamente; no se ha repetido ninguna operación.',
    );
    setBusy(false);
    if (!result.ok) {
      setStatus(undefined);
      setMessage(result.error.message);
      return;
    }
    setStatus(result.value);
    if (result.value.busy)
      setMessage('Hay una operación activa en Main. Espera a que termine y vuelve a consultar.');
    else if (restoreWhenIdle) restore();
  }
  return (
    <main className="panel renderer-recovery" aria-labelledby="recovery-title">
      <h1 id="recovery-title">La interfaz necesita recuperarse</h1>
      <p>
        Las operaciones continúan en el servicio local. Recuperar la interfaz no repite envíos ni
        reinicia ese servicio.
      </p>
      <p>
        El borrador y la lectura de tarjeta de esta pantalla se perderán. Revisa el historial antes
        de iniciar otra transacción.
      </p>
      <button disabled={busy} onClick={() => void inspect(false)}>
        {busy ? 'Comprobando…' : 'Consultar estado de operaciones'}
      </button>
      {message && <p role="alert">{message}</p>}
      {status && !status.busy && (
        <>
          <p role="status">No hay operaciones activas. Historial local consultado.</p>
          {status.recent.length > 0 && (
            <ul>
              {status.recent.map((item) => (
                <li key={item.requestId}>
                  {item.requestId} · {item.outcome}
                </li>
              ))}
            </ul>
          )}
          <button disabled={busy} onClick={() => void inspect(true)}>
            Recuperar interfaz y revisar historial
          </button>
        </>
      )}
    </main>
  );
}

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; restored: boolean }
> {
  state = { failed: false, restored: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  // Do not log the exception, component props or message contents.
  render() {
    if (this.state.failed)
      return <Recovery restore={() => this.setState({ failed: false, restored: true })} />;
    return this.state.restored ? <App initialPage="transactions" /> : this.props.children;
  }
}
