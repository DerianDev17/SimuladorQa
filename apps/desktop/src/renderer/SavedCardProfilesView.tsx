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
  const client = new DesktopClient(window.desktop);

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
    <section className="panel saved-card-profiles" aria-label="Perfiles de referencia de tarjeta">
      <div className="panel-heading">
        <div>
          <h2>Tarjetas QA guardadas</h2>
          <p>Inventario local para reconocer las tarjetas físicas de prueba</p>
        </div>
        <span className="pill neutral">Solo referencia</span>
      </div>
      {environment === 'QA' ? (
        <>
          <div className="saved-card-form">
            <label>
              Alias de la tarjeta
              <input
                aria-label="Alias de la tarjeta QA"
                autoComplete="off"
                maxLength={40}
                placeholder="Ej. Visa débito de pruebas"
                value={alias}
                onChange={(event) => setAlias(event.target.value)}
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
              disabled={busy || identity?.status !== 'READ' || alias.trim().length < 2}
              onClick={() => void save()}
            >
              <Icon name="card" size={16} />
              {busy ? 'Guardando…' : 'Guardar tarjeta leída'}
            </button>
          </div>
          <p className="saved-card-hint">
            {identity?.status === 'READ'
              ? `Lectura activa: termina en ${identity.panMasked?.match(/\d{4}$/)?.[0] ?? 'no disponible'}. Main verificará que siga insertada al guardar.`
              : 'Inserta y lee una tarjeta por contacto para guardar una referencia.'}
          </p>
          {identity?.status === 'READ' && (
            <div className="saved-card-capture" aria-label="Datos detectados del chip">
              <div>
                <span>Aplicación</span>
                <strong>{identity.applicationLabel ?? 'Etiqueta no disponible'}</strong>
              </div>
              <div>
                <span>AID leído</span>
                <strong>{identity.applicationId ?? 'No disponible'}</strong>
              </div>
              <div>
                <span>Datos que solicita el chip</span>
                <strong>
                  {identity.transactionDataRequirements?.cdol1?.length
                    ? `CDOL1 · ${identity.transactionDataRequirements.cdol1.length} campos`
                    : 'CDOL1 no informado'}
                  {identity.transactionDataRequirements?.cdol2?.length
                    ? ` · CDOL2 · ${identity.transactionDataRequirements.cdol2.length} campos`
                    : ''}
                </strong>
                <small>
                  {identity.transactionDataRequirements?.cdol1?.length
                    ? identity.transactionDataRequirements.cdol1
                        .map((item) => `${item.tag}/${item.length}`)
                        .join(' · ')
                    : 'El chip no informó requisitos CDOL1.'}
                </small>
              </div>
            </div>
          )}
          {error && (
            <p className="saved-card-error" role="alert">
              {error}
            </p>
          )}
          <div className="saved-card-privacy">
            <Icon name="shield" size={16} />
            <p>
              Se guardan alias, últimos cuatro, AID, etiqueta de aplicación, listas CDOL (solo tags
              y longitudes) y una cuenta predeterminada opcional. En la transacción, el perfil
              preselecciona el AID y la cuenta; la tarjeta física debe seguir presente para leer el
              chip y generar seguridad nueva. No se guardan PAN completo, vencimiento, Track 2, PIN,
              PIN Block ni criptogramas.
            </p>
          </div>
          <div className="saved-card-field-guide" aria-label="Clasificación de campos de tarjeta">
            <article>
              <strong>Leído del chip</strong>
              <p>AID, etiqueta y CDOL. Se guarda la estructura CDOL, no sus valores.</p>
            </article>
            <article>
              <strong>Nuevo por operación</strong>
              <p>Criptograma, contador y PIN/EMV se vuelven a obtener para cada transacción.</p>
            </article>
            <article>
              <strong>Editable por QA</strong>
              <p>Alias y cuenta predeterminada. La cuenta queda como preferencia de pantalla.</p>
            </article>
            <article>
              <strong>Pendiente de mapeo</strong>
              <p>Track 1, MICR y variables propietarias no se importan ni se envían.</p>
            </article>
          </div>
          <div className="saved-card-list" aria-live="polite">
            <div className="saved-card-list-heading">
              <h3>Perfiles guardados</h3>
              <span>{loading ? 'Cargando…' : profiles.length}</span>
            </div>
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
        </>
      ) : (
        <p className="saved-card-hint">
          El inventario de tarjetas guardadas está limitado al ambiente QA.
        </p>
      )}
    </section>
  );
}
