import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  isValidCardProfileAlias,
  suggestCardProfileAlias,
} from '../../../../packages/domain/src/saved-card-profiles';
import type { Environment } from '../../../../packages/domain/src/index';
import type { CardIdentityReading } from '../../../../packages/domain/src/card-reader';
import { accountTypes } from '../../../../packages/domain/src/transaction-draft';
import type { AccountType } from '../../../../packages/domain/src/transaction-draft';
import type { SavedCardProfile } from '../../../../packages/domain/src/saved-card-profiles';
import { DesktopClient } from './desktop-client';
import { Icon } from './Icon';

interface SavedCardProfilesViewProps {
  children: ReactNode;
  reading: boolean;
  environment: Environment;
  identity: CardIdentityReading | undefined;
}

export function SavedCardProfilesView({
  environment,
  identity,
  children,
  reading,
}: SavedCardProfilesViewProps) {
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
  const suggestedAlias = suggestCardProfileAlias(identity);
  const aliasValid = isValidCardProfileAlias(alias);

  useEffect(() => {
    setAlias(suggestedAlias);
    setSuccess(undefined);
    setError(undefined);
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
    if (busy || reading || environment !== 'QA' || identity?.status !== 'READ' || !aliasValid)
      return;
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
    } else setError(result.error.message);
  };

  const edit = (profile: SavedCardProfile) => {
    setEditingProfileId(profile.id);
    setEditAlias(profile.alias);
    setEditDefaultAccount(profile.defaultAccount ?? '');
    setError(undefined);
  };

  const update = async () => {
    if (busy || environment !== 'QA' || !editingProfileId || !isValidCardProfileAlias(editAlias))
      return;
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
    setSuccess(undefined);
    const result = await client.call((api) => api.deleteCardProfile({ id }));
    setBusy(false);
    if (result.ok) setProfiles(result.value);
    else setError(result.error.message);
  };

  return (
    <section
      className="panel saved-card-profiles card-workbench"
      aria-label="Guardar tarjeta y administrar perfiles QA"
      id="saved-card-profile-form"
    >
      <div className="card-workbench-grid">
        {children}
        <div className="card-profile-editor">
          <div className="card-section-title">
            <span>02</span>
            <h2>Guardar tarjeta</h2>
          </div>
          <p className="card-section-help">Asigna un nombre para reconocerla en tus pruebas.</p>
          {environment !== 'QA' ? (
            <p>El guardado está disponible solo en QA.</p>
          ) : (
            <>
              <div className="saved-card-form">
                <label>
                  Alias de la tarjeta
                  <input
                    id="saved-card-alias"
                    aria-label="Alias de la tarjeta QA"
                    aria-invalid={!!alias && !aliasValid}
                    aria-describedby={alias && !aliasValid ? 'card-alias-help' : undefined}
                    autoComplete="off"
                    maxLength={40}
                    placeholder="Ej. Visa débito de pruebas"
                    value={alias}
                    onChange={(event) => {
                      setAlias(event.target.value);
                      setSuccess(undefined);
                    }}
                    disabled={busy || reading || identity?.status !== 'READ'}
                  />
                </label>
                <label>
                  Cuenta predeterminada
                  <select
                    aria-label="Cuenta predeterminada de la tarjeta"
                    value={defaultAccount}
                    onChange={(event) => {
                      setDefaultAccount(event.target.value as AccountType | '');
                      setSuccess(undefined);
                    }}
                    disabled={busy || reading || identity?.status !== 'READ'}
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
                  disabled={
                    busy || reading || identity?.status !== 'READ' || !aliasValid || !!success
                  }
                  onClick={() => void save()}
                >
                  <Icon name="card" size={16} />
                  {busy ? 'Guardando…' : success ? 'Tarjeta guardada' : 'Guardar tarjeta'}
                </button>
              </div>
              {alias && !aliasValid && (
                <p id="card-alias-help" className="saved-card-error" role="alert">
                  Usa de 2 a 40 caracteres: letras, números, espacios, punto, guion o guion bajo. No
                  incluyas números completos de tarjeta.
                </p>
              )}
              {identity?.status !== 'READ' && (
                <p className="saved-card-hint">
                  {reading ? 'Leyendo el chip…' : 'Lee la tarjeta para habilitar el guardado.'}
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
            </>
          )}
          <p className="card-profile-note">
            <Icon name="shield" size={15} />
            Referencia local. Mantén la tarjeta en el lector para operar.
          </p>
          <details className="inline-details">
            <summary>Qué datos se guardan</summary>
            <p>
              Alias, últimos cuatro, AID, aplicación, estructura CDOL y cuenta elegida. No se
              guardan PAN completo ni datos de autenticación.
            </p>
          </details>
        </div>
      </div>
      {environment === 'QA' && (
        <section className="saved-card-inventory" aria-label="Tarjetas guardadas">
          <div className="panel-heading">
            <h2>Tarjetas guardadas</h2>
            <span className="pill neutral">{loading ? 'Cargando…' : profiles.length}</span>
          </div>
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
                    {profile.defaultAccount
                      ? accountTypes.find((item) => item.id === profile.defaultAccount)?.label
                      : 'Cuenta por operación'}
                  </small>
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
                    aria-invalid={!isValidCardProfileAlias(editAlias)}
                    onChange={(event) => setEditAlias(event.target.value)}
                  />
                  {!isValidCardProfileAlias(editAlias) && (
                    <small role="alert">
                      Usa un alias de 2 a 40 caracteres, sin símbolos ni números completos de
                      tarjeta.
                    </small>
                  )}
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
                  disabled={busy || !isValidCardProfileAlias(editAlias)}
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
        </section>
      )}
    </section>
  );
}
