import { useEffect, useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import type { CardIdentityReading } from '../../../../packages/domain/src/card-reader';
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
      api.saveCardProfile({ readId: identity.readId, alias: alias.trim() }),
    );
    setBusy(false);
    if (result.ok) {
      setProfiles(result.value);
      setAlias('');
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
          {error && (
            <p className="saved-card-error" role="alert">
              {error}
            </p>
          )}
          <div className="saved-card-privacy">
            <Icon name="shield" size={16} />
            <p>
              Se guarda únicamente el alias, los últimos cuatro dígitos, el AID y la fecha de
              registro. No se guarda PAN completo, titular, vencimiento, Track 2, PIN ni datos de
              autenticación EMV. Este inventario no ejecuta transacciones.
            </p>
          </div>
          <div className="saved-card-list" aria-live="polite">
            <div className="saved-card-list-heading">
              <h3>Perfiles guardados</h3>
              <span>{loading ? 'Cargando…' : profiles.length}</span>
            </div>
            {profiles.map((profile) => (
              <article className="saved-card-row" key={profile.id}>
                <span className="saved-card-mark" aria-hidden="true">
                  VISA
                </span>
                <div>
                  <strong>{profile.alias}</strong>
                  <small>
                    {profile.lastFour ? `•••• ${profile.lastFour}` : 'Número no disponible'}
                    {profile.applicationId ? ` · AID ${profile.applicationId}` : ''}
                  </small>
                  <small>Guardada {new Date(profile.savedAt).toLocaleString('es-EC')}</small>
                </div>
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
