import { useEffect, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import type { CardIdentityReading } from '../../../../packages/domain/src/card-reader';
import { accountTypes } from '../../../../packages/domain/src/transaction-draft';
import type { AccountType } from '../../../../packages/domain/src/transaction-draft';
import type { SavedCardProfile } from '../../../../packages/domain/src/saved-card-profiles';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';

interface SavedCardProfilesViewProps {
  environment: Environment;
  identity: CardIdentityReading | undefined;
}

export function SavedCardProfilesView({ environment, identity }: SavedCardProfilesViewProps) {
  const [profiles, setProfiles] = useState<readonly SavedCardProfile[]>([]);
  const [alias, setAlias] = useState('');
  const [defaultAccount, setDefaultAccount] = useState<AccountType | ''>('SAVINGS');
  const [editingProfileId, setEditingProfileId] = useState<string>();
  const [editAlias, setEditAlias] = useState('');
  const [editDefaultAccount, setEditDefaultAccount] = useState<AccountType | ''>('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(environment === 'QA');
  const [error, setError] = useState<string>();
  const [success, setSuccess] = useState<string>();
  const client = new DesktopClient(window.desktop);
  const lastFour =
    identity?.status === 'READ' ? identity.panMasked?.match(/\d{4}$/)?.[0] : undefined;
  const applicationName =
    identity?.status === 'READ' ? (identity.applicationLabel ?? 'Tarjeta QA') : '';
  const suggestedAlias =
    identity?.status === 'READ'
      ? `${applicationName.slice(0, lastFour ? 25 : 40)}${lastFour ? ` · •••• ${lastFour}` : ''}`
      : '';

  useEffect(() => {
    setAlias(suggestedAlias);
    setSuccess(undefined);
  }, [identity?.readId, suggestedAlias]);

  useEffect(() => {
    if (environment !== 'QA') {
      setProfiles([]);
      setLoading(false);
      setError(undefined);
      return;
    }
    let active = true;
    setLoading(true);
    void client
      .call((api) => api.listSavedCardProfiles())
      .then((result) => {
        if (!active) return;
        setLoading(false);
        if (result.ok) {
          setProfiles(result.value);
          setError(undefined);
        } else setError(result.error.message);
      });
    return () => {
      active = false;
    };
  }, [environment]);

  const save = async () => {
    if (busy || environment !== 'QA' || identity?.status !== 'READ' || !alias.trim()) return;
    setBusy(true);
    setError(undefined);
    setSuccess(undefined);
    const result = await client.call((api) =>
      api.saveCardProfile({
        readId: identity.readId,
        alias: alias.trim(),
        defaultAccount: defaultAccount || null,
      }),
    );
    setBusy(false);
    if (result.ok) {
      setProfiles(result.value);
      setSuccess(`Tarjeta «${alias.trim()}» guardada en este equipo.`);
      setAlias('');
    } else setError(result.error.message);
  };

  const edit = (profile: SavedCardProfile) => {
    setEditingProfileId(profile.id);
    setEditAlias(profile.alias);
    setEditDefaultAccount(profile.defaultAccount ?? '');
    setError(undefined);
  };

  const update = async () => {
    if (busy || environment !== 'QA' || !editingProfileId || !editAlias.trim()) return;
    setBusy(true);
    setError(undefined);
    const result = await client.call((api) =>
      api.updateCardProfile({
        id: editingProfileId,
        alias: editAlias.trim(),
        defaultAccount: editDefaultAccount || null,
      }),
    );
    setBusy(false);
    if (result.ok) {
      setProfiles(result.value);
      setEditingProfileId(undefined);
    } else setError(result.error.message);
  };

  const remove = async (id: string) => {
    if (busy || environment !== 'QA') return;
    setBusy(true);
    setError(undefined);
    const result = await client.call((api) => api.deleteCardProfile({ id }));
    setBusy(false);
    if (result.ok) setProfiles(result.value);
    else setError(result.error.message);
  };

  return (
    <section
      className="panel saved-card-profiles"
      aria-label="Guardar tarjeta y administrar perfiles QA"
      id="saved-card-profile-form"
    >
      <div className="panel-heading">
        <div>
          <h2>{environment === 'QA' ? 'Guardar tarjeta QA' : 'Referencias de tarjeta'}</h2>
          <p>
            {environment === 'QA'
              ? 'Referencia local de esta tarjeta física'
              : 'El guardado de perfiles está disponible solo en QA.'}
          </p>
        </div>
        <span className="pill neutral">{environment === 'QA' ? 'Solo referencia' : 'Solo QA'}</span>
      </div>
      {environment === 'QA' ? (
        <>
          {identity?.status === 'READ' && (
            <>
              <div className="saved-card-ready" role="status">
                <span className="saved-card-ready-icon">
                  <Icon name="check" size={16} />
                </span>
                <div>
                  <strong>Tarjeta leída y lista para guardar</strong>
                  <small>
                    {identity.applicationLabel ?? 'Aplicación EMV'}
                    {identity.panMasked?.match(/\d{4}$/)?.[0]
                      ? ` · termina en ${identity.panMasked.match(/\d{4}$/)?.[0]}`
                      : ''}
                  </small>
                </div>
              </div>
              <div className="saved-card-form">
                <label>
                  Alias de la tarjeta
                  <input
                    id="saved-card-alias"
                    aria-label="Alias de la tarjeta QA"
                    autoComplete="off"
                    maxLength={40}
                    placeholder="Ej. Visa débito de pruebas"
                    value={alias}
                    onChange={(event) => {
                      setAlias(event.target.value);
                      setSuccess(undefined);
                    }}
                    disabled={busy}
                  />
                </label>
                <label>
                  Cuenta predeterminada
                  <select
                    aria-label="Cuenta predeterminada de la tarjeta"
                    value={defaultAccount}
                    onChange={(event) => setDefaultAccount(event.target.value as AccountType | '')}
                    disabled={busy}
                  >
                    <option value="">Elegir en cada operación</option>
                    {accountTypes.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy || alias.trim().length < 2}
                  onClick={() => void save()}
                >
                  <Icon name="card" size={16} />
                  {busy ? 'Guardando…' : 'Guardar tarjeta'}
                </button>
              </div>
              <div className="saved-card-capture" aria-label="Datos que se guardarán">
                <div>
                  <span>Identificación</span>
                  <strong>Últimos cuatro · AID</strong>
                </div>
                <div>
                  <span>Aplicación</span>
                  <strong>{identity.applicationLabel ?? 'Etiqueta no disponible'}</strong>
                </div>
                <div>
                  <span>Datos solicitados</span>
                  <strong>
                    {identity.transactionDataRequirements?.cdol1?.length
                      ? `CDOL1 · ${identity.transactionDataRequirements.cdol1.length} campos`
                      : 'CDOL1 no informado'}
                    {identity.transactionDataRequirements?.cdol2?.length
                      ? ` · CDOL2 · ${identity.transactionDataRequirements.cdol2.length} campos`
                      : ''}
                  </strong>
                </div>
              </div>
            </>
          )}
          {identity?.status !== 'READ' && (
            <p className="saved-card-hint">
              Inserta la tarjeta, espera a que el lector la detecte y pulsa «Leer datos del chip».
              La opción para guardarla aparecerá al terminar.
            </p>
          )}
          {error && (
            <p className="saved-card-error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="saved-card-success" role="status">
              {success}
            </p>
          )}
          <div className="saved-card-privacy">
            <Icon name="shield" size={16} />
            <p>
              Se guardan solo alias, últimos cuatro, AID, aplicación, estructura CDOL y cuenta
              elegida. No se guarda PAN completo ni datos de autenticación.
            </p>
          </div>
          <details className="saved-card-inventory">
            <summary>Perfiles guardados ({loading ? '…' : profiles.length})</summary>
            <div className="saved-card-list" aria-live="polite">
              {profiles.map((profile) => (
                <article className="saved-card-row" key={profile.id}>
                  <span className="saved-card-mark" aria-hidden="true">
                    CHIP
                  </span>
                  <div>
                    <strong>{profile.alias}</strong>
                    <small>
                      {profile.lastFour ? `•••• ${profile.lastFour}` : 'Número no disponible'}
                      {profile.applicationLabel ? ` · ${profile.applicationLabel}` : ''}
                    </small>
                    <small>
                      {profile.applicationId ? `AID ${profile.applicationId}` : 'AID no disponible'}
                      {profile.defaultAccount
                        ? ` · Cuenta predeterminada: ${accountTypes.find((item) => item.id === profile.defaultAccount)?.label}`
                        : ' · Cuenta por operación'}
                    </small>
                    {profile.transactionDataRequirements?.cdol1 && (
                      <small>
                        CDOL1:{' '}
                        {profile.transactionDataRequirements.cdol1
                          .map((item) => item.tag)
                          .join(' · ')}
                      </small>
                    )}
                    <small>Guardada {new Date(profile.savedAt).toLocaleString('es-EC')}</small>
                  </div>
                  <button
                    className="text-button"
                    aria-label={`Editar perfil ${profile.alias}`}
                    disabled={busy}
                    onClick={() => edit(profile)}
                  >
                    Editar
                  </button>
                  <button
                    className="text-button"
                    aria-label={`Eliminar perfil ${profile.alias}`}
                    disabled={busy}
                    onClick={() => void remove(profile.id)}
                  >
                    Eliminar
                  </button>
                </article>
              ))}
              {editingProfileId && (
                <div className="saved-card-edit" aria-label="Editar tarjeta QA">
                  <label>
                    Alias
                    <input
                      aria-label="Editar alias de tarjeta"
                      maxLength={40}
                      value={editAlias}
                      disabled={busy}
                      onChange={(event) => setEditAlias(event.target.value)}
                    />
                  </label>
                  <label>
                    Cuenta predeterminada
                    <select
                      aria-label="Editar cuenta predeterminada"
                      value={editDefaultAccount}
                      disabled={busy}
                      onChange={(event) =>
                        setEditDefaultAccount(event.target.value as AccountType | '')
                      }
                    >
                      <option value="">Elegir en cada operación</option>
                      {accountTypes.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={busy || editAlias.trim().length < 2}
                    onClick={() => void update()}
                  >
                    {busy ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() => setEditingProfileId(undefined)}
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {!loading && profiles.length === 0 && (
                <p className="saved-card-empty">Todavía no guardaste referencias de tarjetas.</p>
              )}
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
