import { useEffect, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import type { SendConfigurationSnapshot } from '../../../../packages/domain/src/send-configuration';
import type { SwitchConnectionSnapshot } from '../../../../packages/domain/src/switch-connection';
import type { DesktopClient } from './desktop-client';

interface Props {
  environment: Environment | undefined;
  client: DesktopClient;
  disabled: boolean;
  activeAtms: number | undefined;
  catalogBusy: boolean;
  catalogError: string | undefined;
  connection: SwitchConnectionSnapshot | undefined;
  connectionError: string | undefined;
  onRefreshCatalog(): void;
  onOpenSend(): void;
  onOpenDevices(): void;
  onOpenAtms(): void;
}

const deadlineLabel = (value: number | null) => (value === null ? 'Pendiente' : `${value} ms`);

export function SettingsConfigurationDetails(props: Props) {
  const { client, environment } = props;
  const [setup, setSetup] = useState<SendConfigurationSnapshot>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setSetup(undefined);
    setError('');
    setBusy(true);
    if (environment) {
      void client
        .call((api) => api.getSendConfiguration(environment))
        .then((result) => {
          if (!active) return;
          setBusy(false);
          if (result.ok) setSetup(result.value);
          else setError(result.error.message);
        });
    }
    return () => {
      active = false;
    };
  }, [client, environment, retry]);

  function refresh() {
    setSetup(undefined);
    setBusy(true);
    setError('');
    setRetry((value) => value + 1);
    props.onRefreshCatalog();
  }
  const configuration = setup?.configuration;
  const endpoint = configuration?.endpoint;
  const connected = props.connection?.state === 'CONNECTED';
  const sameDestination =
    !!endpoint &&
    endpoint.host === props.connection?.endpoint?.host &&
    endpoint.port === props.connection?.endpoint?.port;
  const checks = [
    {
      label: 'Destino de envío',
      ready: !!configuration && setup?.status !== 'SOURCE_CHANGED',
      detail: !setup
        ? 'Sin verificar'
        : !endpoint
          ? 'Falta guardar IP y puerto'
          : setup.status === 'SOURCE_CHANGED'
            ? 'El destino requiere actualización'
            : `${endpoint.host}:${endpoint.port}`,
    },
    {
      label: 'Plazo de conexión',
      ready: !!configuration?.connectDeadlineMs,
      detail: !setup ? 'Sin verificar' : deadlineLabel(configuration?.connectDeadlineMs ?? null),
    },
    {
      label: 'Plazo de respuesta',
      ready: !!configuration?.observationWindowMs,
      detail: !setup ? 'Sin verificar' : deadlineLabel(configuration?.observationWindowMs ?? null),
    },
    {
      label: 'Perfiles ATM activos',
      ready: !props.catalogBusy && !props.catalogError && (props.activeAtms ?? 0) > 0,
      detail: props.catalogBusy
        ? 'Consultando perfiles…'
        : props.catalogError || props.activeAtms === undefined
          ? 'Sin verificar'
          : `${props.activeAtms} ATM con entidad activa`,
    },
    {
      label: 'Conexión TCP',
      ready: connected && sameDestination && !props.connectionError,
      detail:
        props.connectionError || !props.connection || !setup
          ? 'Sin verificar'
          : connected
            ? sameDestination
              ? 'Conectado al destino guardado'
              : 'Conectado a otro destino'
            : props.connection.state === 'CONNECTING'
              ? 'Conectando…'
              : 'Desconectado',
    },
  ];
  return (
    <section className="panel settings-requirements" aria-label="Requisitos de configuración">
      <div className="panel-heading">
        <div>
          <h2>Comprobaciones de la estación</h2>
          <p>Estado de los ajustes guardados, perfiles y conexión actual.</p>
        </div>
        <button disabled={props.disabled || busy} onClick={refresh}>
          {busy ? 'Consultando…' : 'Actualizar comprobaciones'}
        </button>
      </div>
      {busy && <p role="status">Consultando configuración guardada…</p>}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {props.catalogError && (
        <p className="inline-error" role="alert">
          {props.catalogError}
        </p>
      )}
      {props.connectionError && (
        <p className="inline-error" role="alert">
          {props.connectionError}
        </p>
      )}
      <ul className="settings-check-list" aria-label="Comprobaciones actuales">
        {checks.map((check) => (
          <li key={check.label}>
            <div>
              <strong>{check.label}</strong>
              <span>{check.detail}</span>
            </div>
            <span className={`pill ${check.ready ? 'blue' : 'neutral'}`}>
              {check.ready
                ? 'Verificado'
                : check.detail === 'Sin verificar'
                  ? 'Sin verificar'
                  : 'Por completar'}
            </span>
          </li>
        ))}
      </ul>
      <div className="settings-operational-actions">
        <button disabled={props.disabled} onClick={props.onOpenSend}>
          Configurar envío
        </button>
        <button disabled={props.disabled} onClick={props.onOpenAtms}>
          Revisar perfiles ATM
        </button>
        <button disabled={props.disabled} onClick={props.onOpenDevices}>
          Abrir dispositivos y conexión
        </button>
      </div>
      <p className="settings-context-note">
        Cada transacción comprueba además el perfil autorizado, la tarjeta y su seguridad antes de
        enviar. Consultar esta pantalla no abre conexiones.
      </p>
    </section>
  );
}
