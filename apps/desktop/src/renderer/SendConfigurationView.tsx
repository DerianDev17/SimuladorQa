import { useEffect, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import type {
  SendConfigurationSnapshot,
  SendTrigger,
} from '../../../../packages/domain/src/send-configuration';
import type { DesktopClient } from './desktop-client';

interface Props {
  environment: Environment | undefined;
  client: DesktopClient;
  disabled: boolean;
  onEditingChange(value: boolean): void;
}
export function SendConfigurationView({ environment, client, disabled, onEditingChange }: Props) {
  const [setup, setSetup] = useState<SendConfigurationSnapshot>();
  const [trigger, setTrigger] = useState<SendTrigger>('ON_CLICK');
  const [connect, setConnect] = useState('');
  const [observe, setObserve] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [retry, setRetry] = useState(0);
  const dirty =
    !!setup &&
    (trigger !== (setup.configuration?.trigger ?? 'ON_CLICK') ||
      connect !== (setup.configuration?.connectDeadlineMs?.toString() ?? '') ||
      observe !== (setup.configuration?.observationWindowMs?.toString() ?? ''));
  useEffect(() => {
    onEditingChange(dirty || busy);
    return () => onEditingChange(false);
  }, [dirty, busy, onEditingChange]);
  function apply(value: SendConfigurationSnapshot) {
    setSetup(value);
    setTrigger(value.configuration?.trigger ?? 'ON_CLICK');
    setConnect(value.configuration?.connectDeadlineMs?.toString() ?? '');
    setObserve(value.configuration?.observationWindowMs?.toString() ?? '');
  }
  useEffect(() => {
    let active = true;
    if (!environment) {
      setBusy(false);
      return;
    }
    setBusy(true);
    setSetup(undefined);
    setError('');
    void client
      .call((api) => api.getSendConfiguration(environment))
      .then((result) => {
        if (!active) return;
        setBusy(false);
        if (result.ok) {
          apply(result.value);
          setNeedsReload(false);
        } else {
          setError(result.error.message);
          setNeedsReload(true);
        }
      });
    return () => {
      active = false;
    };
  }, [environment, client, retry]);
  async function save() {
    if (!setup?.documentedEndpoint || !environment || busy || disabled || needsReload) return;
    const valid = (value: string) =>
      !value || (/^[1-9]\d{0,4}$/.test(value) && Number(value) <= 30000);
    if (!valid(connect) || !valid(observe)) {
      setError('Usa milisegundos enteros entre 1 y 30000, o deja el plazo pendiente.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    const result = await client.call((api) =>
      api.saveSendConfiguration({
        environment,
        revision: setup.configuration?.revision ?? null,
        values: {
          evidenceId: setup.documentedEndpoint!.evidenceId,
          trigger,
          connectDeadlineMs: connect ? Number(connect) : null,
          observationWindowMs: observe ? Number(observe) : null,
        },
      }),
    );
    setBusy(false);
    if (result.ok) {
      apply(result.value);
      setMessage('Configuración guardada. No se ha abierto ninguna conexión.');
    } else {
      setError(result.error.message);
      setNeedsReload(true);
    }
  }
  return (
    <section className="panel send-configuration-panel" aria-label="Configuración de envío">
      <div className="panel-heading">
        <h2>Envío de tramas</h2>
        <span className="pill amber">Generación pendiente</span>
      </div>
      <p className="form-note">Desde los datos del formulario, sin pegar tramas HEX.</p>
      {busy && <p role="status">Cargando configuración…</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="catalog-notice" role="status">
          {message}
        </p>
      )}
      {setup && (
        <>
          <dl className="station-details">
            <div>
              <dt>Destino {environment}</dt>
              <dd>
                {setup.documentedEndpoint
                  ? setup.documentedEndpoint.host + ':' + setup.documentedEndpoint.port
                  : 'Sin destino documentado'}
              </dd>
            </div>
          </dl>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={disabled || busy || needsReload || !setup.documentedEndpoint}>
              <div className="form-grid">
                <label>
                  Modo previsto
                  <select
                    value={trigger}
                    onChange={(event) => {
                      if (
                        event.target.value === 'ON_CLICK' ||
                        event.target.value === 'AFTER_REVIEW'
                      )
                        setTrigger(event.target.value);
                      setMessage('');
                    }}
                  >
                    <option value="ON_CLICK">Al pulsar Enviar transacción</option>
                    <option value="AFTER_REVIEW">Después de revisar la transacción</option>
                  </select>
                </label>
                <label>
                  Espera de conexión (ms)
                  <input
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="Pendiente"
                    value={connect}
                    onChange={(event) => {
                      setConnect(event.target.value);
                      setMessage('');
                    }}
                  />
                </label>
                <label>
                  Ventana de respuesta (ms)
                  <input
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="Pendiente"
                    value={observe}
                    onChange={(event) => {
                      setObserve(event.target.value);
                      setMessage('');
                    }}
                  />
                </label>
              </div>
            </fieldset>
            <div className="catalog-actions editor-actions">
              {dirty && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    apply(setup);
                    setMessage('');
                    setError('');
                  }}
                >
                  Descartar cambios de envío
                </button>
              )}
              <button
                type="button"
                disabled={busy || dirty || disabled}
                onClick={() => {
                  setMessage('');
                  setRetry((value) => value + 1);
                }}
              >
                Recargar envío
              </button>
              <button
                className="primary"
                disabled={
                  disabled ||
                  busy ||
                  needsReload ||
                  !setup.documentedEndpoint ||
                  (!!setup.configuration && !dirty)
                }
                type="submit"
              >
                {busy ? 'Guardando…' : 'Guardar configuración de envío'}
              </button>
            </div>
          </form>
          <details className="inline-details">
            <summary>Requisitos para activar el envío</summary>
            <ul>
              {setup.pending.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ul>
            <p>
              Los plazos son controles técnicos del intento; no definen timeouts ISO del proveedor.
              Guardar o preparar no transmite. El generador sigue bloqueado hasta aprobar campos
              dinámicos, perfil de tarjeta y seguridad.
            </p>
          </details>
        </>
      )}
      {!setup && !busy && (
        <button onClick={() => setRetry((value) => value + 1)} disabled={disabled}>
          Reintentar configuración de envío
        </button>
      )}
    </section>
  );
}
