import { useEffect, useRef, useState } from 'react';
import type { CardReaderSnapshot, ReaderDevice } from '../../../../packages/domain/src/card-reader';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';

const stateLabels = {
  CARD_PRESENT: 'Tarjeta presente',
  EMPTY: 'Sin tarjeta',
  UNAVAILABLE: 'Lector no disponible',
} satisfies Record<ReaderDevice['state'], string>;

interface CardReaderPanelProps {
  snapshot: CardReaderSnapshot | undefined;
  error: string | undefined;
  refreshing: boolean;
  selectedName: string | undefined;
  onSelect: (name: string) => void;
  onRefresh: () => void;
  compact: boolean;
}

export function CardReaderPanel({
  snapshot,
  error,
  refreshing,
  selectedName,
  onSelect,
  onRefresh,
  compact,
}: CardReaderPanelProps) {
  const reader =
    snapshot?.readers.find((device) => device.name === selectedName) ??
    snapshot?.readers.find((device) => device.state === 'CARD_PRESENT') ??
    snapshot?.readers[0];
  const present = reader?.state === 'CARD_PRESENT';
  const status = error
    ? 'Conexión no disponible'
    : !snapshot
      ? 'Consultando lector…'
      : reader
        ? stateLabels[reader.state]
        : 'No hay lectores conectados';
  const title = present
    ? 'Tarjeta detectada'
    : error
      ? 'Revisa la conexión'
      : 'Esperando tu tarjeta';
  const hint = present
    ? 'Estos son los datos disponibles de la tarjeta en esta interfaz.'
    : error
      ? 'Comprueba el lector y vuelve a consultar.'
      : !reader
        ? 'Conecta el lector para comenzar.'
        : reader.state === 'UNAVAILABLE'
          ? 'Comprueba la conexión de esta interfaz.'
          : 'Inserta o acerca una tarjeta al lector.';

  return (
    <section
      className={`panel card-reader-view ${compact ? 'card-reader-compact' : ''}`}
      aria-label="Estado del lector"
    >
      <div className="panel-heading">
        <div className="card-reader-heading">
          <span className="card-reader-icon">
            <Icon name="reader" size={22} />
          </span>
          <div>
            <h2>Lector de tarjetas</h2>
            <p>Detección en tiempo real · PC/SC</p>
          </div>
        </div>
        <button className="card-reader-refresh" onClick={onRefresh} disabled={refreshing}>
          <Icon name="history" size={15} />
          {refreshing ? 'Consultando…' : 'Actualizar'}
        </button>
      </div>
      <div className="card-reader-status" role="status" aria-live="polite">
        <span className={`reader-status-dot ${present ? 'is-present' : ''}`} />
        <strong>{status}</strong>
        <span>Actualización automática</span>
      </div>
      {error && (
        <p className="card-reader-error" role="alert">
          {error}
        </p>
      )}
      <div className="card-reader-layout">
        <div className="card-preview-stage">
          <div
            className={`detected-card ${present ? 'is-present' : 'is-empty'}`}
            aria-label={present ? 'Tarjeta detectada' : 'Sin tarjeta detectada'}
          >
            <div className="detected-card-top">
              <span>
                COONECTA <small>QA · TARJETAS</small>
              </span>
              <Icon name="card" size={27} />
            </div>
            <div className="detected-card-chip" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="detected-card-number" aria-label="Número de tarjeta no leído">
              •••• &nbsp; •••• &nbsp; •••• &nbsp; ••••
            </div>
            <div className="detected-card-bottom">
              <div>
                <small>IDENTIDAD DE TARJETA</small>
                <strong>{present ? 'Pendiente de lectura' : 'Sin tarjeta detectada'}</strong>
              </div>
              <span>{present ? 'DETECTADA' : 'EN ESPERA'}</span>
            </div>
          </div>
          <div className="card-preview-caption">
            <h3>{title}</h3>
            <p>{hint}</p>
          </div>
        </div>
        <div className="card-reader-data">
          <div className="card-data-heading">
            <h3>Datos de la tarjeta</h3>
            <span className="pill neutral">{present ? 'Presencia confirmada' : 'Sin lectura'}</span>
          </div>
          <dl className="card-data-list">
            <div>
              <dt>Lector</dt>
              <dd>{reader?.name ?? 'No disponible'}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>{status}</dd>
            </div>
            <div>
              <dt>ATR</dt>
              <dd className="card-atr">
                {present && reader.atr ? (
                  <code>{reader.atr.match(/.{2}/g)?.join(' ')}</code>
                ) : present ? (
                  'No disponible'
                ) : (
                  'Sin lectura'
                )}
              </dd>
            </div>
            <div>
              <dt>Número de tarjeta</dt>
              <dd className="card-data-pending">No leído</dd>
            </div>
            {!compact && (
              <>
                <div>
                  <dt>Titular</dt>
                  <dd className="card-data-pending">No leído</dd>
                </div>
                <div>
                  <dt>Vencimiento</dt>
                  <dd className="card-data-pending">No leído</dd>
                </div>
                <div>
                  <dt>Entidad / producto</dt>
                  <dd className="card-data-pending">Perfil no asociado</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>
      {!!snapshot?.readers.length && (
        <div className="reader-devices" aria-label="Interfaces del lector">
          <div className="reader-devices-heading">
            <h3>Interfaces del lector</h3>
            <span>{snapshot.readers.length} interfaces</span>
          </div>
          {snapshot.readers.map((device, index) => (
            <button
              className="reader-device"
              key={`${device.name}-${index}`}
              aria-pressed={reader?.name === device.name}
              onClick={() => onSelect(device.name)}
            >
              <Icon name="reader" size={18} />
              <span>
                <strong>{device.name}</strong>
                <small>{stateLabels[device.state]}</small>
              </span>
              <Icon name={reader?.name === device.name ? 'check' : 'arrow'} size={16} />
            </button>
          ))}
        </div>
      )}
      <div className="card-reader-footer">
        <Icon name="clock" size={14} />
        <span>
          {snapshot
            ? `Actualizado: ${new Date(snapshot.checkedAt).toLocaleTimeString()}`
            : 'Esperando la primera consulta'}{' '}
          · Consulta cada 5 s
        </span>
      </div>
      <div className="document-note card-reader-note">
        <Icon name="shield" size={18} />
        <p>
          La presencia de la tarjeta no identifica su número ni su cuenta. La lectura de identidad
          requiere el perfil APDU aprobado. El PAN se mostrará enmascarado cuando esté disponible.
        </p>
      </div>
    </section>
  );
}

export function CardReaderView({ compact = false }: { compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<CardReaderSnapshot>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(true);
  const [selectedName, setSelectedName] = useState<string>();
  const refreshRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    const client = new DesktopClient(window.desktop, 10000);
    let active = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (!active || pending) return;
      pending = true;
      clearTimeout(timer);
      setRefreshing(true);
      const result = await client.call((api) => api.getReaderSnapshot());
      if (!active) return;
      if (result.ok) {
        setSnapshot(result.value);
        setError(undefined);
      } else {
        setSnapshot(undefined);
        setError(result.error.message);
      }
      pending = false;
      setRefreshing(false);
      timer = setTimeout(() => void refresh(), 5000);
    };
    refreshRef.current = () => void refresh();
    void refresh();
    return () => {
      active = false;
      refreshRef.current = undefined;
      clearTimeout(timer);
    };
  }, []);
  return (
    <CardReaderPanel
      snapshot={snapshot}
      error={error}
      refreshing={refreshing}
      selectedName={selectedName}
      onSelect={setSelectedName}
      onRefresh={() => refreshRef.current?.()}
      compact={compact}
    />
  );
}
