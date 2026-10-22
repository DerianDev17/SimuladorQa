import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardReaderSnapshot, ReaderDevice } from '../../../../packages/domain/src/card-reader';
import type { Environment } from '../../../../packages/domain/src/index';
import type { AccountType } from '../../../../packages/domain/src/transaction-draft';
import type { SavedCardProfile } from '../../../../packages/domain/src/saved-card-profiles';
import type { Result } from '../../../../packages/shared/src/contracts';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import { selectedReader, matchingCardIdentity } from './card-reader-state';
import { availableTransactionCard, matchesSavedCardProfile } from './transaction-card';
import type { TransactionCard } from './transaction-card';
import { SavedCardProfilesView } from './SavedCardProfilesView';
import { CardReaderWorkspace } from './CardReaderWorkspace';

const stateLabels = {
  CARD_PRESENT: 'Tarjeta presente',
  EMPTY: 'Sin tarjeta',
  UNAVAILABLE: 'Lector no disponible',
} satisfies Record<ReaderDevice['state'], string>;

export interface CardReaderPanelProps {
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
  const reader = selectedReader(snapshot, selectedName);
  const present = !error && reader?.state === 'CARD_PRESENT';
  const identity = error ? undefined : matchingCardIdentity(snapshot, reader?.name);
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
      : !snapshot
        ? 'Consultando lector…'
        : reader?.state === 'UNAVAILABLE'
          ? 'Lector no disponible'
          : !reader
            ? 'Conecta un lector'
            : 'Esperando tu tarjeta';
  const cardPlaceholder = error
    ? 'Sin conexión con el lector'
    : !snapshot
      ? 'Consulta pendiente'
      : reader?.state === 'UNAVAILABLE'
        ? 'Lector no disponible'
        : !reader
          ? 'Sin lector conectado'
          : 'Sin tarjeta detectada';
  const hint = present
    ? read
      ? 'Identidad leída del chip; número de tarjeta enmascarado.'
      : 'Tarjeta presente. Pulsa Leer datos del chip para ver su identidad.'
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
            <p>Detección PC/SC</p>
          </div>
        </div>
        <button
          className="card-reader-refresh"
          onClick={onRefresh}
          disabled={refreshing || reading}
        >
          <Icon name="history" size={15} />
          {refreshing ? 'Consultando…' : 'Actualizar'}
        </button>
      </div>
      <div className="card-reader-status" role="status" aria-live="polite">
        <span className={`reader-status-dot ${present ? 'is-present' : ''}`} />
        <strong>{status}</strong>
        <span>Actualización automática</span>
      </div>
      {compact && onRead && (
        <div className="card-reader-quick-read">
          <button
            className="card-chip-read"
            disabled={!present || reading || refreshing}
            onClick={() => reader && onRead(reader.name)}
          >
            <Icon name="card" size={16} />
            {reading ? 'Leyendo chip…' : read ? 'Volver a leer chip' : 'Leer datos del chip'}
          </button>
          <span>Lectura manual por contacto</span>
        </div>
      )}
      {error && (
        <p className="card-reader-error" role="alert">
          {error}
        </p>
      )}
      <div className="card-reader-layout">
        <div className="card-preview-stage">
          <div
            className={`detected-card ${present ? 'is-present' : 'is-empty'}`}
            aria-label={
              present
                ? 'Tarjeta detectada'
                : reader?.state === 'EMPTY' && !error
                  ? 'Sin tarjeta detectada'
                  : 'Estado de la tarjeta'
            }
          >
            <div className="detected-card-top">
              <span>
                COONECTA <small>LECTURA DE TARJETA</small>
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
                      : cardPlaceholder}
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
            {read && (
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
              {!compact && (
                <button
                  className="card-chip-read"
                  disabled={!present || reading || refreshing}
                  onClick={() => reader && onRead(reader.name)}
                >
                  <Icon name="card" size={16} />
                  {reading ? 'Leyendo chip…' : 'Leer datos del chip'}
                </button>
              )}
              {!compact && <small>Inserta la tarjeta por contacto. Lectura EMV manual.</small>}
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
                      disabled={reading || refreshing}
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

interface CardReaderViewProps {
  environment?: Environment;
  compact?: boolean;
  transaction?: boolean;
  disabled?: boolean;
  selectedReadId?: string | undefined;
  onUseCard?: (card: TransactionCard) => void;
  onClearCard?: () => void;
  onSavedProfileAccount?: (account: AccountType | null) => void;
  onAvailableCardChange?: (card: TransactionCard | undefined) => void;
  onReadingChange?: (reading: boolean) => void;
}

export function CardReaderView({
  environment,
  compact = false,
  transaction = false,
  disabled = false,
  selectedReadId,
  onUseCard,
  onClearCard,
  onSavedProfileAccount,
  onAvailableCardChange,
  onReadingChange,
}: CardReaderViewProps) {
  const [snapshot, setSnapshot] = useState<CardReaderSnapshot>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(true);
  const [selectedName, setSelectedName] = useState<string>();
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string>();
  const [manualSelection, setManualSelection] = useState<string>();
  const [savedProfiles, setSavedProfiles] = useState<readonly SavedCardProfile[]>([]);
  const [savedProfilesLoading, setSavedProfilesLoading] = useState(false);
  const [selectedSavedProfileId, setSelectedSavedProfileId] = useState('');
  const [profileMismatch, setProfileMismatch] = useState(false);
  // Ecuador was explicitly selected by the user for this QA station.
  const [countryCode, setCountryCode] = useState('218');
  const mounted = useRef(false);
  const readPending = useRef(false);
  const statusRequest = useRef<Promise<Result<CardReaderSnapshot>> | undefined>(undefined);
  const lastReaderEvent = useRef<Result<CardReaderSnapshot> | undefined>(undefined);
  const refreshRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => {
    mounted.current = true;
    const client = new DesktopClient(window.desktop, 10000);
    let active = true;
    let pending = false;
    let eventRevision = 0;
    const apply = (result: Result<CardReaderSnapshot>) => {
      if (!active) return;
      if (result.ok) {
        setSnapshot(result.value);
        setError(undefined);
      } else {
        setSnapshot(undefined);
        setError(result.error.message);
      }
      setRefreshing(false);
    };
    // Subscribe before the initial snapshot; a late IPC reply cannot erase an
    // insertion/removal delivered meanwhile. Idle views have no refresh timer.
    const unsubscribe = window.desktop?.onReaderSnapshot?.((result) => {
      eventRevision++;
      lastReaderEvent.current = result;
      apply(result);
    });
    const refresh = async () => {
      if (!active || pending || readPending.current) return;
      pending = true;
      setRefreshing(true);
      const revision = eventRevision;
      const request = client.call((api) => api.getReaderSnapshot());
      statusRequest.current = request;
      const result = await request;
      if (statusRequest.current === request) statusRequest.current = undefined;
      if (!active) return;
      if (revision === eventRevision) apply(result);
      pending = false;
      setRefreshing(false);
    };
    refreshRef.current = () => void refresh();
    void refresh();
    return () => {
      active = false;
      mounted.current = false;
      refreshRef.current = undefined;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    if (!transaction || environment !== 'QA') {
      setSavedProfiles([]);
      setSelectedSavedProfileId('');
      setSavedProfilesLoading(false);
      return;
    }
    let active = true;
    setSavedProfilesLoading(true);
    void new DesktopClient(window.desktop)
      .call((api) => api.listSavedCardProfiles())
      .then((result) => {
        if (!active) return;
        setSavedProfilesLoading(false);
        if (!result.ok) return;
        setSavedProfiles(result.value);
        setSelectedSavedProfileId((selected) =>
          result.value.some((profile) => profile.id === selected && profile.applicationId)
            ? selected
            : '',
        );
      });
    return () => {
      active = false;
    };
  }, [environment, transaction]);
  const reader = selectedReader(snapshot, selectedName);
  const identity = error ? undefined : matchingCardIdentity(snapshot, reader?.name);
  useEffect(() => {
    if (
      snapshot &&
      selectedName &&
      !snapshot.readers.some((device) => device.name === selectedName)
    )
      setSelectedName(reader?.name);
  }, [snapshot, selectedName, reader?.name]);
  useEffect(() => {
    setReadError(undefined);
  }, [reader?.name, reader?.state]);
  useEffect(() => {
    if (identity?.status === 'READ') setReadError(undefined);
  }, [identity?.readId, identity?.status]);
  const availableCard = useMemo(
    () => availableTransactionCard(error ? undefined : snapshot, reader?.name),
    [snapshot, reader?.name, error],
  );
  const usableProfiles = savedProfiles.filter((profile) => profile.applicationId);
  const selectedSavedProfile = usableProfiles.find(
    (profile) => profile.id === selectedSavedProfileId,
  );
  useEffect(() => {
    if (refreshing || reading) return;
    onAvailableCardChange?.(availableCard);
    // Select only after the successful manual read is committed to this snapshot.
    // A previous status effect must not invalidate a newly selected identity.
    if (manualSelection) {
      setManualSelection(undefined);
      if (availableCard?.readId === manualSelection) {
        const profile = selectedSavedProfile;
        if (profile && !matchesSavedCardProfile(profile, availableCard)) setProfileMismatch(true);
        else {
          setProfileMismatch(false);
          onUseCard?.(availableCard);
          if (profile) onSavedProfileAccount?.(profile.defaultAccount);
        }
      }
    }
  }, [
    availableCard,
    refreshing,
    reading,
    manualSelection,
    selectedSavedProfile,
    onAvailableCardChange,
    onUseCard,
    onSavedProfileAccount,
  ]);
  useEffect(() => {
    onReadingChange?.(reading);
  }, [reading, onReadingChange]);
  useEffect(() => () => onReadingChange?.(false), [onReadingChange]);
  const readChip = async (readerName: string, applicationId?: string) => {
    if (
      readPending.current ||
      disabled ||
      error ||
      reader?.name !== readerName ||
      reader.state !== 'CARD_PRESENT'
    )
      return;
    if (!/^(?!000)\d{3}$/.test(countryCode)) {
      setReadError('Ingresa un código de país ISO numérico de tres dígitos.');
      return;
    }
    readPending.current = true;
    setManualSelection(undefined);
    setProfileMismatch(false);
    setReading(true);
    setReadError(undefined);
    setSnapshot((current) => current && { ...current, identity: null, identityStatus: 'NOT_READ' });
    // Wait for an explicit refresh already in flight before reading the chip.
    const pendingStatus = statusRequest.current;
    if (pendingStatus) {
      const status = await pendingStatus;
      if (!mounted.current) {
        readPending.current = false;
        return;
      }
      if (
        !status.ok ||
        !status.value.readers.some(
          (device) => device.name === readerName && device.state === 'CARD_PRESENT',
        )
      ) {
        readPending.current = false;
        setReading(false);
        setReadError('No se pudo confirmar la tarjeta en el lector. Vuelve a consultar su estado.');
        return;
      }
    }
    const request = applicationId
      ? { readerName, applicationId, terminalCountryCode: countryCode }
      : { readerName, terminalCountryCode: countryCode };
    const eventBeforeRead = lastReaderEvent.current;
    const result = await new DesktopClient(window.desktop, 25000).call((api) =>
      api.readCardIdentity(request),
    );
    readPending.current = false;
    if (!mounted.current) return;
    setReading(false);
    const changedEvent = lastReaderEvent.current;
    if (
      result.ok &&
      changedEvent &&
      changedEvent !== eventBeforeRead &&
      (!changedEvent.ok || changedEvent.value.identity?.readId !== result.value.readId)
    ) {
      setReadError('La tarjeta cambió durante la lectura. Vuelve a leer la tarjeta presente.');
      return;
    }
    if (result.ok && result.value.readerName !== readerName) {
      setReadError('La lectura no corresponde al lector seleccionado. Vuelve a leer la tarjeta.');
    } else if (result.ok) {
      const card =
        result.value.status === 'READ'
          ? {
              readId: result.value.readId,
              readerName: result.value.readerName,
              panMasked: result.value.panMasked,
              applicationLabel: result.value.applicationLabel,
              applicationId: result.value.applicationId,
            }
          : undefined;
      const mismatch = !!(
        transaction &&
        selectedSavedProfile &&
        card &&
        !matchesSavedCardProfile(selectedSavedProfile, card)
      );
      setProfileMismatch(mismatch);
      setSnapshot((current) =>
        current &&
        current.readers.some(
          (device) => device.name === readerName && device.state === 'CARD_PRESENT',
        )
          ? {
              ...current,
              identity: result.value,
              identityStatus: result.value.status === 'READ' ? 'READ' : 'NOT_READ',
            }
          : current,
      );
      if (mismatch) {
        setReadError(
          'La tarjeta leída no coincide con el perfil QA elegido. Confirma el AID y los últimos cuatro dígitos.',
        );
      } else if (transaction && result.value.status === 'READ') {
        setManualSelection(result.value.readId);
      }
    } else {
      if (transaction && selectedSavedProfile && result.error.code === 'CONFLICT')
        setProfileMismatch(true);
      setReadError(result.error.message);
      if (['NOT_FOUND', 'SERVICE_UNAVAILABLE', 'TIMEOUT'].includes(result.error.code))
        refreshRef.current?.();
    }
  };
  if (transaction)
    return (
      <div className="transaction-card-picker" aria-label="Elegir tarjeta">
        <div className="reader-input-row">
          <label>
            Lector
            <select
              aria-label="Lector para la transacción"
              value={reader?.name ?? ''}
              disabled={disabled || refreshing || reading || !snapshot?.readers.length}
              onChange={(event) => setSelectedName(event.target.value)}
            >
              {!snapshot?.readers.length && (
                <option value="">{refreshing ? 'Buscando lector…' : 'Sin lector conectado'}</option>
              )}
              {snapshot?.readers.map((device) => (
                <option key={device.name} value={device.name}>
                  {device.name} · {stateLabels[device.state]}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={disabled || reading || !!error || reader?.state !== 'CARD_PRESENT'}
            onClick={() =>
              reader && void readChip(reader.name, selectedSavedProfile?.applicationId ?? undefined)
            }
          >
            <Icon name="reader" size={16} />
            {reading ? 'Leyendo tarjeta…' : 'Leer tarjeta'}
          </button>
        </div>
        {environment === 'QA' && (
          <label className="saved-profile-picker">
            Perfil QA guardado
            <select
              aria-label="Perfil QA guardado para la transacción"
              value={selectedSavedProfileId}
              disabled={disabled || reading || refreshing || savedProfilesLoading}
              onChange={(event) => {
                setSelectedSavedProfileId(event.target.value);
                setProfileMismatch(false);
                setManualSelection(undefined);
                onClearCard?.();
              }}
            >
              <option value="">
                {savedProfilesLoading
                  ? 'Cargando perfiles…'
                  : 'Sin perfil · elegir aplicación al leer'}
              </option>
              {usableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.alias} · {profile.lastFour ? `•••• ${profile.lastFour}` : 'AID'}
                </option>
              ))}
            </select>
            {selectedSavedProfile && (
              <small>
                Leerá el AID {selectedSavedProfile.applicationId}. Requiere la tarjeta física y
                genera seguridad nueva desde el chip.
                {selectedSavedProfile.defaultAccount
                  ? ` Cuenta al usarla: ${selectedSavedProfile.defaultAccount === 'SAVINGS' ? 'Ahorros' : 'Corriente'}.`
                  : ''}
              </small>
            )}
            {!savedProfilesLoading && usableProfiles.length === 0 && (
              <small>Guarda primero una lectura en Tarjetas para preseleccionar el AID.</small>
            )}
            {selectedSavedProfile &&
              availableCard &&
              !matchesSavedCardProfile(selectedSavedProfile, availableCard) && (
                <small className="saved-profile-mismatch">
                  La lectura actual no coincide con este perfil. Elige otro perfil o vuelve a leer.
                </small>
              )}
          </label>
        )}
        <div className="transaction-card-status" role="status">
          <Icon name="card" size={24} />
          <div>
            <strong>
              {reading
                ? 'Leyendo tarjeta…'
                : refreshing && !snapshot
                  ? 'Buscando lector…'
                  : error || reader?.state === 'UNAVAILABLE'
                    ? 'Lector no disponible'
                    : !reader
                      ? 'Sin lectores conectados'
                      : identity?.status === 'SELECT_APPLICATION'
                        ? 'Selecciona una aplicación'
                        : (availableCard?.panMasked ??
                          (availableCard
                            ? 'Número no disponible en el chip'
                            : reader.state === 'CARD_PRESENT'
                              ? 'Tarjeta detectada · falta leerla'
                              : 'Inserta una tarjeta por contacto'))}
            </strong>
            <span>
              {refreshing
                ? 'Consultando estado del lector'
                : (availableCard?.applicationLabel ??
                  (reader
                    ? reader.state === 'EMPTY'
                      ? 'Detección automática activa'
                      : stateLabels[reader.state]
                    : 'Conecta un lector; se detectará automáticamente'))}
            </span>
          </div>
          {!refreshing &&
            !reading &&
            selectedReadId &&
            selectedReadId === availableCard?.readId && (
              <button className="text-button" disabled={disabled || reading} onClick={onClearCard}>
                Cambiar tarjeta
              </button>
            )}
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {readError && (
          <p className="inline-error" role="alert">
            {readError}
          </p>
        )}
        {profileMismatch && (
          <p className="inline-error" role="alert">
            No se seleccionó esta tarjeta para la transacción porque no coincide con el perfil QA.
          </p>
        )}
        {identity?.status === 'SELECT_APPLICATION' && (
          <div className="card-application-choice">
            <p>Elige la aplicación de la tarjeta:</p>
            {identity.applications.map((application) => (
              <button
                key={application.id}
                disabled={disabled || reading || refreshing}
                onClick={() => reader && void readChip(reader.name, application.id)}
              >
                {application.label ?? 'Aplicación EMV'} · {application.id}
              </button>
            ))}
          </div>
        )}
        {identity?.status === 'DIRECTORY_UNAVAILABLE' && (
          <p className="form-note">Esta tarjeta necesita un perfil de aplicación documentado.</p>
        )}
        {identity?.status === 'TERMINAL_DATA_REQUIRED' && (
          <p className="form-note">
            Faltan parámetros del terminal para leer esta tarjeta. Revisa los detalles del lector.
          </p>
        )}
        {availableCard && selectedReadId !== availableCard.readId && (
          <button
            className="text-button"
            disabled={
              disabled ||
              reading ||
              refreshing ||
              profileMismatch ||
              (!!selectedSavedProfile &&
                !matchesSavedCardProfile(selectedSavedProfile, availableCard))
            }
            onClick={() => {
              onUseCard?.(availableCard);
              if (selectedSavedProfile)
                onSavedProfileAccount?.(selectedSavedProfile.defaultAccount);
            }}
          >
            Seleccionar tarjeta leída
          </button>
        )}
        <div className="reader-secondary-actions">
          <button
            className="text-button"
            disabled={disabled || refreshing || reading}
            onClick={() => refreshRef.current?.()}
          >
            {refreshing ? 'Buscando…' : 'Buscar lector'}
          </button>
        </div>
        <details className="inline-details">
          <summary>Opciones de lectura</summary>
          <label className="card-country-field">
            País del terminal (ISO numérico)
            <input
              inputMode="numeric"
              maxLength={3}
              value={countryCode}
              disabled={disabled || reading}
              onChange={(event) => setCountryCode(event.target.value)}
            />
          </label>
          <p>La identidad leída no define la cuenta ni habilita el envío financiero.</p>
        </details>
      </div>
    );
  const panelProps = {
    snapshot,
    error,
    refreshing,
    selectedName,
    onSelect: setSelectedName,
    onRefresh: () => refreshRef.current?.(),
    compact,
    reading,
    readError,
    onRead: (name: string, applicationId?: string) => void readChip(name, applicationId),
    countryCode,
    onCountryChange: setCountryCode,
  };
  if (!compact && environment)
    return (
      <SavedCardProfilesView
        environment={environment}
        identity={error ? undefined : identity}
        reading={reading}
      >
        <CardReaderWorkspace {...panelProps} />
      </SavedCardProfilesView>
    );
  return <CardReaderPanel {...panelProps} />;
}
