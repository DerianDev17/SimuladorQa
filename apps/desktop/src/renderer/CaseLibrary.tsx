import { useEffect, useRef, useState } from 'react';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { caseAtmAvailable, parseCaseValues } from '../../../../packages/domain/src/saved-cases';
import type { SavedCase } from '../../../../packages/domain/src/saved-cases';
import type { DraftRequest } from '../../../../packages/domain/src/transaction-draft';
import { transactions } from '../../../../packages/domain/src/index';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';

interface Props {
  draft: DraftRequest | undefined;
  catalog: CatalogSnapshot | undefined;
  client: DesktopClient;
  disabled: boolean;
  canSave: boolean;
  onCatalogChange(catalog: CatalogSnapshot): void;
  onLoad(draft: DraftRequest, warning: string | undefined): void;
  onOpenChange(open: boolean): void;
}

export function CaseLibrary({
  draft,
  catalog,
  client,
  disabled,
  canSave,
  onCatalogChange,
  onLoad,
  onOpenChange,
}: Props) {
  const [mode, setMode] = useState<'save' | 'list'>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<SavedCase>();
  const [needsReload, setNeedsReload] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      onOpenChange(false);
    };
  }, [onOpenChange]);
  useEffect(() => {
    if (mode) dialog.current?.showModal();
    else dialog.current?.close();
  }, [mode]);

  function close() {
    setMode(undefined);
    setDeleting(undefined);
    setError('');
    onOpenChange(false);
  }
  async function open(next: 'save' | 'list') {
    setError('');
    setMessage('');
    setDeleting(undefined);
    setMode(next);
    onOpenChange(true);
    if (next === 'save') {
      setName('');
      return;
    }
    await refresh();
  }
  async function refresh(): Promise<CatalogSnapshot | undefined> {
    if (!draft) return undefined;
    setBusy(true);
    setError('');
    const result = await client.call((api) => api.getCatalog(draft.environment));
    if (!active.current) return undefined;
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return undefined;
    }
    onCatalogChange(result.value);
    setNeedsReload(false);
    return result.value;
  }
  async function save() {
    if (busy || needsReload) return;
    if (!draft || !parseCaseValues({ name, draft })) {
      setError('Escribe un nombre de hasta 80 caracteres, sin datos de tarjeta ni secretos.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await client.call((api) =>
      api.saveCase({
        environment: draft.environment,
        id: null,
        revision: null,
        values: { name, draft },
      }),
    );
    if (!active.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(`${result.error.message} Recarga los casos antes de reintentar.`);
      setNeedsReload(true);
      return;
    }
    onCatalogChange(result.value);
    close();
    setMessage('Caso guardado como borrador local. No se ha ejecutado ninguna transacción.');
  }
  async function load(saved: SavedCase) {
    const latest = await refresh();
    if (!latest) return;
    const current = latest.cases.find((item) => item.id === saved.id);
    if (!current || current.revision !== saved.revision) {
      setError('El caso cambió o fue eliminado. La lista se actualizó; vuelve a seleccionarlo.');
      return;
    }
    const available = caseAtmAvailable(current, latest);
    onLoad(
      available ? current.draft : { ...current.draft, atmId: null, atmRevision: null },
      available
        ? undefined
        : 'El ATM guardado cambió o no está disponible. Selecciona un perfil actual y vuelve a revisar los requisitos.',
    );
    close();
    setMessage(`Caso «${current.name}» cargado. Revisa los requisitos antes de continuar.`);
  }
  async function remove() {
    if (!deleting || busy || needsReload) return;
    setBusy(true);
    setError('');
    const result = await client.call((api) =>
      api.deleteCase({
        environment: deleting.environment,
        id: deleting.id,
        revision: deleting.revision,
      }),
    );
    if (!active.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(`${result.error.message} Recarga la lista antes de reintentar.`);
      setNeedsReload(true);
      return;
    }
    onCatalogChange(result.value);
    setDeleting(undefined);
    setMessage('Caso eliminado.');
  }

  return (
    <>
      <button disabled={disabled || !canSave} onClick={() => void open('save')}>
        <Icon name="file" size={16} /> Guardar como caso
      </button>
      <button disabled={disabled || !catalog} onClick={() => void open('list')}>
        Casos guardados ({catalog?.cases.length ?? 0})
      </button>
      {message && (
        <span className="case-notice" role="status">
          {message}
        </span>
      )}
      <dialog
        ref={dialog}
        className={`catalog-dialog ${mode === 'list' ? 'case-library-dialog' : ''}`}
        aria-labelledby="case-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) close();
        }}
      >
        <h2 id="case-dialog-title">{mode === 'save' ? 'Guardar caso local' : 'Casos guardados'}</h2>
        <p>
          Borradores de {draft?.environment}. Las referencias son documentales; guardar o cargar un
          caso no habilita el envío.
        </p>
        {error && <p role="alert">{error}</p>}
        {mode === 'save' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              Nombre del caso
              <input
                autoFocus
                value={name}
                maxLength={80}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="catalog-actions">
              {needsReload && (
                <button type="button" disabled={busy} onClick={() => void open('list')}>
                  Revisar casos guardados
                </button>
              )}
              <button type="button" disabled={busy} onClick={close}>
                Cancelar
              </button>
              <button
                className="primary"
                disabled={busy || needsReload || !name.trim()}
                type="submit"
              >
                {busy ? 'Guardando…' : 'Guardar caso'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="catalog-actions">
              <button
                disabled={busy}
                onClick={() => {
                  setDeleting(undefined);
                  void refresh();
                }}
              >
                Recargar casos
              </button>
              <button disabled={busy} onClick={close}>
                Cerrar
              </button>
            </div>
            {deleting ? (
              <div className="document-note">
                <div>
                  <strong>Eliminar «{deleting.name}»</strong>
                  <p>Se eliminará el borrador local y se registrará la acción en la auditoría.</p>
                  <div className="catalog-actions">
                    <button disabled={busy} onClick={() => setDeleting(undefined)}>
                      Cancelar eliminación
                    </button>
                    <button disabled={busy || needsReload} onClick={() => void remove()}>
                      Confirmar eliminación
                    </button>
                  </div>
                </div>
              </div>
            ) : !catalog?.cases.length ? (
              <p>{busy ? 'Cargando casos…' : 'Aún no hay casos guardados en este ambiente.'}</p>
            ) : (
              <ul className="saved-case-list">
                {catalog.cases.map((saved) => (
                  <li key={saved.id}>
                    <div>
                      <strong>{saved.name}</strong>
                      <small>
                        {transactions.find((item) => item.id === saved.draft.transaction)?.label} ·{' '}
                        {saved.draft.scenario} · Borrador · v{saved.revision}
                      </small>
                      <small>{new Date(saved.updatedAt).toLocaleString('es-EC')}</small>
                      {!caseAtmAvailable(saved, catalog) && (
                        <p>ATM pendiente de seleccionar de nuevo.</p>
                      )}
                      <details>
                        <summary>Referencias documentales</summary>
                        {saved.evidenceDocuments.map((document) => (
                          <p key={document}>
                            <code>{document}</code>
                          </p>
                        ))}
                      </details>
                    </div>
                    <div className="catalog-actions">
                      <button
                        disabled={busy}
                        aria-label={`Cargar ${saved.name}`}
                        onClick={() => void load(saved)}
                      >
                        Cargar
                      </button>
                      <button
                        disabled={busy}
                        aria-label={`Eliminar caso ${saved.name}`}
                        onClick={() => {
                          setError('');
                          setDeleting(saved);
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
