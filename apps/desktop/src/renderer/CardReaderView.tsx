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
  reading?: boolean;
  readError?: string | undefined;
  onRead?: (readerName: string, applicationId?: string) => void;
  countryCode?: string;
  onCountryChange?: (value: string) => void;
}

export function CardReaderPanel({
  snapshot,
  error,
  refreshing,
  selectedName,
  onSelect,
  onRefresh,
  compact,
  reading = false,
  readError,
  onRead,
  countryCode = '',
  onCountryChange,
}: CardReaderPanelProps) {
  const reader =
    snapshot?.readers.find((device) => device.name === selectedName) ??
    snapshot?.readers.find((device) => device.state === 'CARD_PRESENT') ??
    snapshot?.readers[0];
  const present = reader?.state === 'CARD_PRESENT';
  const identity =
    present && snapshot?.identity?.readerName === reader.name ? snapshot.identity : undefined;
  const read = identity?.status === 'READ';
  const unavailable = read ? 'No disponible en el chip' : 'No leído';
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
            <div
              className="detected-card-number"
              aria-label={
                identity?.panMasked ? 'Número de tarjeta enmascarado' : 'Número de tarjeta no leído'
              }
            >
              {identity?.panMasked ?? '••••　••••　••••　••••'}
            </div>
            <div className="detected-card-bottom">
              <div>
                <small>{read ? 'TITULAR' : 'IDENTIDAD DE TARJETA'}</small>
                <strong>
                  {read
                    ? (identity.cardholderName ?? 'No disponible en el chip')
                    : present
                      ? 'Pendiente de lectura'
                      : 'Sin tarjeta detectada'}
                </strong>
              </div>
              <span>
                {read ? (identity.expiry ?? 'CHIP LEÍDO') : present ? 'DETECTADA' : 'EN ESPERA'}
              </span>
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
            <span className="pill neutral">
              {read ? 'Leído del chip' : present ? 'Presencia confirmada' : 'Sin lectura'}
            </span>
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
              <dd className={identity?.panMasked ? '' : 'card-data-pending'}>
                {identity?.panMasked ?? unavailable}
              </dd>
            </div>
            {!compact && (
              <>
                <div>
                  <dt>Titular</dt>
                  <dd className={identity?.cardholderName ? '' : 'card-data-pending'}>
                    {identity?.cardholderName ?? unavailable}
                  </dd>
                </div>
                <div>
                  <dt>Vencimiento</dt>
                  <dd className={identity?.expiry ? '' : 'card-data-pending'}>
                    {identity?.expiry ?? unavailable}
                  </dd>
                </div>
                <div>
                  <dt>Aplicación del chip</dt>
                  <dd>{identity?.applicationLabel ?? identity?.applicationId ?? 'Sin lectura'}</dd>
                </div>
                <div>
                  <dt>Entidad / producto</dt>
                  <dd className="card-data-pending">Perfil no asociado</dd>
                </div>
              </>
            )}
          </dl>
          {onRead && (
            <div className="card-reader-controls">
              {onCountryChange && (
                <label className="card-country-field">
                  País del terminal (ISO numérico)
                  <input
                    aria-label="País del terminal (ISO numérico)"
                    inputMode="numeric"
                    maxLength={3}
                    value={countryCode}
                    onChange={(event) => onCountryChange(event.target.value)}
                    disabled={reading}
                  />
                </label>
              )}
              <button
                className="card-chip-read"
                disabled={!present || reading || refreshing}
                onClick={() => reader && onRead(reader.name)}
              >
                <Icon name="card" size={16} />
                {reading ? 'Leyendo chip…' : 'Leer datos del chip'}
              </button>
              <small>Inserta la tarjeta por contacto. Lectura EMV manual.</small>
              {read && <small>Lectura: {new Date(identity.readAt).toLocaleTimeString()}</small>}
              {identity?.status === 'DIRECTORY_UNAVAILABLE' && (
                <p>
                  Esta tarjeta no expone el directorio EMV de contacto. Se necesita su AID
                  documentado.
                </p>
              )}
              {identity?.status === 'TERMINAL_DATA_REQUIRED' && (
                <p>
                  La tarjeta solicita parámetros del terminal (PDOL):{' '}
                  {identity.requiredTerminalData
                    ?.map((entry) => `${entry.tag} (${entry.length} bytes)`)
                    .join(', ')}
                  . Completa el país si solicita 9F1A; otros parámetros requieren un perfil
                  validado.
                </p>
              )}
              {identity?.status === 'SELECT_APPLICATION' && (
                <div className="card-application-choice">
                  <p>Selecciona la aplicación que deseas leer:</p>
                  {identity.applications.map((application) => (
                    <button
                      key={application.id}
                      disabled={reading}
                      onClick={() => reader && onRead(reader.name, application.id)}
                    >
                      {application.label ?? 'Aplicación EMV'} · {application.id}
                    </button>
                  ))}
                </div>
              )}
              {readError && (
                <p role="alert" className="card-reader-error">
                  {readError}
                </p>
              )}
            </div>
          )}
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
              disabled={reading}
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
          La presencia de la tarjeta no identifica su número ni su cuenta. Leer datos del chip
          muestra los campos EMV disponibles con el PAN enmascarado. Los datos no expuestos
          requieren un perfil validado.
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
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string>();
  // Ecuador was explicitly selected by the user for this QA station.
  const [countryCode, setCountryCode] = useState('218');
  const mounted = useRef(false);
  const readPending = useRef(false);
  const refreshRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
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
      mounted.current = false;
      refreshRef.current = undefined;
      clearTimeout(timer);
    };
  }, []);
  const readChip = async (readerName: string, applicationId?: string) => {
    if (readPending.current) return;
    if (!/^(?!000)\d{3}$/.test(countryCode)) {
      setReadError('Ingresa un código de país ISO numérico de tres dígitos.');
      return;
    }
    readPending.current = true;
    setReading(true);
    setReadError(undefined);
    setSnapshot((current) => current && { ...current, identity: null, identityStatus: 'NOT_READ' });
    const request = applicationId
      ? { readerName, applicationId, terminalCountryCode: countryCode }
      : { readerName, terminalCountryCode: countryCode };
    const result = await new DesktopClient(window.desktop, 25000).call((api) =>
      api.readCardIdentity(request),
    );
    readPending.current = false;
    if (!mounted.current) return;
    setReading(false);
    if (result.ok) {
      setSnapshot(
        (current) =>
          current && {
            ...current,
            identity: result.value,
            identityStatus: result.value.status === 'READ' ? 'READ' : 'NOT_READ',
          },
      );
    } else setReadError(result.error.message);
  };
  return (
    <CardReaderPanel
      snapshot={snapshot}
      error={error}
      refreshing={refreshing}
      selectedName={selectedName}
      onSelect={setSelectedName}
      onRefresh={() => refreshRef.current?.()}
      compact={compact}
      reading={reading}
      readError={readError}
      onRead={(name, applicationId) => void readChip(name, applicationId)}
      countryCode={countryCode}
      onCountryChange={setCountryCode}
    />
  );
}
