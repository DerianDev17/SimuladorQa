import { useEffect, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import { isSendEndpoint } from '../../../../packages/domain/src/send-configuration';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';

interface Props {
  environment: Environment | undefined;
  client: DesktopClient;
  disabled: boolean;
  onEditingChange(value: boolean): void;
}
export function SendConfigurationView({ environment, client, disabled, onEditingChange }: Props) {
  const [setup, setSetup] = useState<SendConfigurationSnapshot>();
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [connect, setConnect] = useState('');
  const [observe, setObserve] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [retry, setRetry] = useState(0);
  const dirty =
    !!setup &&
    (host !== (setup.configuration?.endpoint.host ?? setup.documentedEndpoint?.host ?? '') ||
      port !==
        ((setup.configuration?.endpoint.port ?? setup.documentedEndpoint?.port)?.toString() ??
          '') ||
      connect !== (setup.configuration?.connectDeadlineMs?.toString() ?? '') ||
      observe !== (setup.configuration?.observationWindowMs?.toString() ?? ''));
  useEffect(() => {
    onEditingChange(dirty || busy);
    return () => onEditingChange(false);
  }, [dirty, busy, onEditingChange]);
  function apply(value: SendConfigurationSnapshot) {
    setSetup(value);
    setHost(value.configuration?.endpoint.host ?? value.documentedEndpoint?.host ?? '');
    setPort(
      (value.configuration?.endpoint.port ?? value.documentedEndpoint?.port)?.toString() ?? '',
    );
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
    if (!setup || !environment || busy || disabled || needsReload) return;
    const endpoint = { host: host.trim(), port: Number(port) };
    if (!/^[1-9]\d{0,4}$/.test(port) || !isSendEndpoint(endpoint)) {
      setError('Introduce una dirección IPv4 válida y un puerto entero entre 1 y 65535.');
      return;
    }
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
        endpoint,
        values: {
          evidenceId: null,
          trigger: 'ON_CLICK',
          connectDeadlineMs: connect ? Number(connect) : null,
          observationWindowMs: observe ? Number(observe) : null,
        },
      }),
    );
    setBusy(false);
    if (result.ok) {
      apply(result.value);
      setMessage(
        'Configuración guardada. Se aplicará al siguiente intento. Pulsa Conectar para abrir la conexión con estos ajustes.',
      );
    } else {
      setError(result.error.message);
      setNeedsReload(true);
    }
  }
  return (
    <section className="panel send-configuration-panel" aria-label="Configuración de envío">
      <div className="panel-heading">
        <div>
          <h2>Destino y plazos de envío</h2>
          <p>Define la IP, el puerto y los plazos que utiliza el simulador en Qa.</p>
        </div>
        <span className={`pill ${dirty ? 'amber' : 'neutral'}`}>
          {busy
            ? 'Procesando'
            : dirty
              ? 'Sin guardar'
              : setup?.configuration
                ? `Revisión ${setup.configuration.revision}`
                : 'Sin configurar'}
        </span>
      </div>
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
          <dl className="settings-destination" aria-label="Ajustes guardados">
            <div>
              <dt>
                <Icon name="database" size={18} /> Destino guardado
              </dt>
              <dd>
                {setup.configuration
                  ? setup.configuration.endpoint.host + ':' + setup.configuration.endpoint.port
                  : 'Sin configurar'}
              </dd>
            </div>
            <div>
              <dt>Plazos guardados</dt>
              <dd className="settings-destination-source">
                Conexión:{' '}
                {setup.configuration?.connectDeadlineMs
                  ? `${setup.configuration.connectDeadlineMs} ms`
                  : 'Pendiente'}
                {' · '}Respuesta:{' '}
                {setup.configuration?.observationWindowMs
                  ? `${setup.configuration.observationWindowMs} ms`
                  : 'Pendiente'}
              </dd>
            </div>
          </dl>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={disabled || busy || needsReload}>
              <div className="settings-send-fields">
                <div className="settings-field-row">
                  <div>
                    <h3>Conexión al Switch</h3>
                    <p>
                      Destino utilizado por Conectar. Las transacciones requieren un perfil ATM
                      compatible con esta IP y puerto.
                    </p>
                  </div>
                  <div className="settings-timeouts">
                    <label>
                      Dirección IP del Switch
                      <input
                        value={host}
                        maxLength={15}
                        inputMode="decimal"
                        autoComplete="off"
                        onChange={(event) => {
                          setHost(event.target.value);
                          setMessage('');
                        }}
                      />
                    </label>
                    <label>
                      Puerto del Switch
                      <input
                        value={port}
                        maxLength={5}
                        inputMode="numeric"
                        autoComplete="off"
                        onChange={(event) => {
                          setPort(event.target.value);
                          setMessage('');
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div className="settings-field-row">
                  <div>
                    <h3>Plazos del intento</h3>
                    <p>De 1 a 30.000 ms. Deja un campo vacío para mantenerlo pendiente.</p>
                  </div>
                  <div className="settings-timeouts">
                    <label>
                      Espera de conexión (ms)
                      <input
                        inputMode="numeric"
                        maxLength={5}
                        placeholder="Pendiente"
                        aria-describedby="settings-timeout-help"
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
                        aria-describedby="settings-timeout-help"
                        value={observe}
                        onChange={(event) => {
                          setObserve(event.target.value);
                          setMessage('');
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
              <p id="settings-timeout-help" className="settings-context-note">
                <Icon name="clock" size={16} /> La conexión requiere su plazo. Las transacciones
                requieren ambos plazos y se inician desde Transacciones o Carga.
              </p>
            </fieldset>
            <div className="catalog-actions editor-actions">
              <span className="settings-save-note">
                {dirty
                  ? 'Guarda o descarta para cambiar de página.'
                  : 'Guardar cierra la conexión anterior. Conectar utiliza los ajustes guardados.'}
              </span>
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
                  (!!setup.configuration && !dirty && setup.status !== 'SOURCE_CHANGED')
                }
                type="submit"
              >
                {busy ? 'Guardando…' : 'Guardar configuración de envío'}
              </button>
            </div>
          </form>
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
