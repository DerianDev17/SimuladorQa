import type { CardReaderPanelProps } from './CardReaderView';
import { selectedReader, matchingCardIdentity } from './card-reader-state';
import { Icon } from './Icon';

export function CardReaderWorkspace({
  snapshot,
  error,
  refreshing,
  selectedName,
  onSelect,
  onRefresh,
  reading,
  readError,
  onRead,
  countryCode,
  onCountryChange,
}: CardReaderPanelProps) {
  const reader = selectedReader(snapshot, selectedName);
  const identity = error ? undefined : matchingCardIdentity(snapshot, reader?.name);
  const present = !error && reader?.state === 'CARD_PRESENT';
  const read = identity?.status === 'READ';
  const status = error
    ? 'Lector no disponible'
    : !snapshot
      ? 'Buscando lector…'
      : !reader
        ? 'Conecta un lector'
        : reader.state === 'UNAVAILABLE'
          ? 'Lector no disponible'
          : present
            ? read
              ? 'Lectura completada'
              : 'Tarjeta detectada'
            : 'Esperando tarjeta';
  return (
    <section className="card-reader-workbench" aria-label="Estado del lector">
      <div className="card-section-title">
        <span>01</span>
        <h2>Lector de tarjetas</h2>
        <button className="text-button" disabled={refreshing || reading} onClick={onRefresh}>
          <Icon name="history" size={14} />
          {refreshing ? 'Buscando…' : 'Actualizar'}
        </button>
      </div>
      <label className="card-reader-select">
        Lector
        <select
          aria-label="Lector"
          value={reader?.name ?? ''}
          disabled={reading || refreshing || !snapshot?.readers.length}
          onChange={(event) => onSelect(event.target.value)}
        >
          {!snapshot?.readers.length && <option value="">Sin lectores conectados</option>}
          {snapshot?.readers.map((device) => (
            <option key={device.name} value={device.name}>
              {device.name}
            </option>
          ))}
        </select>
      </label>
      <div className={`card-read-summary ${present ? 'is-present' : ''}`} role="status">
        <span className="card-read-symbol">
          <Icon name="card" size={32} />
        </span>
        <div>
          <span className="card-read-status">{reading ? 'Leyendo chip…' : status}</span>
          <h3>{read ? (identity.applicationLabel ?? 'Tarjeta EMV') : 'Tarjeta física'}</h3>
          <p>
            {read
              ? identity.panMasked?.match(/\d{4}$/)?.[0]
                ? `•••• ${identity.panMasked.match(/\d{4}$/)?.[0]}`
                : 'Número no disponible'
              : present
                ? 'Lista para leer sus datos'
                : 'Inserta la tarjeta en el lector'}
          </p>
        </div>
      </div>
      <button
        className={read ? 'secondary card-read-button' : 'primary card-read-button'}
        disabled={!present || reading || refreshing}
        onClick={() => reader && onRead?.(reader.name)}
      >
        <Icon name="reader" size={16} />
        {reading ? 'Leyendo…' : read ? 'Volver a leer' : 'Leer tarjeta'}
      </button>
      {(error || readError) && (
        <p className="saved-card-error" role="alert">
          {error || readError}
        </p>
      )}
      {identity?.status === 'DIRECTORY_UNAVAILABLE' && (
        <p role="alert">
          Esta tarjeta no expone el directorio EMV. Se necesita su AID documentado.
        </p>
      )}
      {identity?.status === 'TERMINAL_DATA_REQUIRED' && (
        <p role="alert">
          El chip solicita datos del terminal:{' '}
          {identity.requiredTerminalData?.map((item) => item.tag).join(', ')}. Revisa las opciones
          de lectura.
        </p>
      )}
      {identity?.status === 'SELECT_APPLICATION' && (
        <div className="card-application-choice">
          <p>Elige la aplicación de la tarjeta:</p>
          {identity.applications.map((application) => (
            <button
              key={application.id}
              disabled={reading || refreshing}
              onClick={() => reader && onRead?.(reader.name, application.id)}
            >
              {application.label ?? application.id}
            </button>
          ))}
        </div>
      )}
      <details className="inline-details card-read-details">
        <summary>Opciones y datos del chip</summary>
        <label className="card-country-field">
          País del terminal (ISO numérico)
          <input
            inputMode="numeric"
            maxLength={3}
            value={countryCode}
            disabled={reading}
            onChange={(event) => onCountryChange?.(event.target.value)}
          />
        </label>
        <dl>
          <dt>AID</dt>
          <dd>{read ? (identity.applicationId ?? 'No disponible') : 'Sin lectura'}</dd>
          <dt>ATR</dt>
          <dd>{reader?.atr ?? 'No disponible'}</dd>
          {read && (
            <>
              <dt>Datos solicitados (CDOL1)</dt>
              <dd>
                {identity.transactionDataRequirements?.cdol1
                  ?.map((item) => `${item.tag}/${item.length}`)
                  .join(' · ') || 'No informados'}
              </dd>
              <dt>Datos solicitados (CDOL2)</dt>
              <dd>
                {identity.transactionDataRequirements?.cdol2
                  ?.map((item) => `${item.tag}/${item.length}`)
                  .join(' · ') || 'No informados'}
              </dd>
            </>
          )}
        </dl>
      </details>
    </section>
  );
}
