import { CardReaderPanel } from './CardReaderPanel';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardReaderSnapshot } from '../../../../packages/domain/src/card-reader';
import type { Environment } from '../../../../packages/domain/src/index';
import type { AccountType } from '../../../../packages/domain/src/transaction-draft';
import type { SavedCardProfile } from '../../../../packages/domain/src/saved-card-profiles';
import type { Result } from '../../../../packages/shared/src/contracts';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import {
  selectedReader,
  matchingCardIdentity,
  readerStateLabels as stateLabels,
} from './card-reader-state';
import { availableTransactionCard, matchesSavedCardProfile } from './transaction-card';
import type { TransactionCard } from './transaction-card';
import { SavedCardProfilesView } from './SavedCardProfilesView';
import { CardReaderWorkspace } from './CardReaderWorkspace';

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
  const [cardMode, setCardMode] = useState<'physical' | 'configured'>('physical');
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
        <div className="transaction-card-modes" role="group" aria-label="Origen de la tarjeta">
          {(['physical', 'configured'] as const).map((mode) => (
            <button
              key={mode}
              aria-pressed={cardMode === mode}
              disabled={
                disabled || reading || refreshing || (mode === 'configured' && environment !== 'QA')
              }
              onClick={() => {
                if (cardMode === mode) return;
                setCardMode(mode);
                setSelectedSavedProfileId('');
                setProfileMismatch(false);
                setManualSelection(undefined);
                onClearCard?.();
              }}
            >
              <Icon name={mode === 'physical' ? 'reader' : 'card'} size={18} />
              {mode === 'physical' ? 'Lector físico' : 'Tarjeta configurada'}
            </button>
          ))}
        </div>
        <div
          className="reader-input-row"
          hidden={!!selectedReadId && selectedReadId === availableCard?.readId}
        >
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
        {environment === 'QA' && cardMode === 'configured' && (
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
        <div className={`transaction-card-status${availableCard ? ' has-card' : ''}`} role="status">
          <div className="transaction-card-status-heading">
            <span>
              <Icon name={availableCard ? 'check' : 'card'} size={15} />
              {availableCard
                ? 'Tarjeta leída'
                : reader?.state === 'CARD_PRESENT'
                  ? 'Tarjeta detectada'
                  : 'Estado de la tarjeta'}
            </span>
            {!refreshing &&
              !reading &&
              selectedReadId &&
              selectedReadId === availableCard?.readId && (
                <button
                  className="text-button"
                  aria-label="Cambiar tarjeta"
                  disabled={disabled}
                  onClick={onClearCard}
                >
                  Cambiar
                </button>
              )}
          </div>
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
            {!availableCard && (
              <span>
                {refreshing
                  ? 'Consultando estado del lector'
                  : reader
                    ? reader.state === 'EMPTY'
                      ? 'Detección automática activa'
                      : stateLabels[reader.state]
                    : 'Conecta un lector; se detectará automáticamente'}
              </span>
            )}
            {availableCard && identity?.status === 'READ' && (
              <details className="transaction-card-facts-details">
                <summary>Detalles de la tarjeta</summary>
                <dl className="transaction-card-facts">
                  <div>
                    <dt>Aplicación</dt>
                    <dd>{identity.applicationLabel ?? 'No informada'}</dd>
                  </div>
                  <div>
                    <dt>Expiración</dt>
                    <dd>{identity.expiry ?? 'No informada'}</dd>
                  </div>
                  {selectedSavedProfile && (
                    <div>
                      <dt>Perfil QA</dt>
                      <dd>{selectedSavedProfile.alias}</dd>
                    </div>
                  )}
                </dl>
              </details>
            )}
          </div>
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
