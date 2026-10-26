import { useEffect, useRef, useState } from 'react';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import {
  caseAtmAvailable,
  isRestrictedCaseText,
  parseCaseValues,
} from '../../../../packages/domain/src/saved-cases';
import type { SavedCase } from '../../../../packages/domain/src/saved-cases';
import type { DraftRequest } from '../../../../packages/domain/src/transaction-draft';
import { scenarios, transactions } from '../../../../packages/domain/src/index';
import { accountTypes } from '../../../../packages/domain/src/transaction-draft';
import { filterCases } from './case-filters';
import type { CaseFilters } from './case-filters';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';

interface Props {
  draft: DraftRequest | undefined;
  catalog: CatalogSnapshot | undefined;
  client: DesktopClient;
  disabled: boolean;
  canSave: boolean;
  onCatalogChange(catalog: CatalogSnapshot): void;
  onLoad(draft: DraftRequest, warning: string | undefined, saved: SavedCase): void;
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
  const [editing, setEditing] = useState<SavedCase>();
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [expectedCode, setExpectedCode] = useState('');
  const [expectationSource, setExpectationSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<SavedCase>();
  const [needsReload, setNeedsReload] = useState(false);
  const [filters, setFilters] = useState<CaseFilters>({
    query: '',
    transaction: 'ALL',
    atm: 'ALL',
  });
  const [filterError, setFilterError] = useState('');
  const filteredCases = catalog ? filterCases(catalog, filters) : [];
  const filtersActive = !!filters.query || filters.transaction !== 'ALL' || filters.atm !== 'ALL';
  function clearFilters() {
    setFilters({ query: '', transaction: 'ALL', atm: 'ALL' });
    setFilterError('');
  }
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
    setEditing(undefined);
    setDeleting(undefined);
    setError('');
    onOpenChange(false);
  }
  async function open(next: 'save' | 'list') {
    setError('');
    setMessage('');
    setDeleting(undefined);
    clearFilters();
    setMode(next);
    onOpenChange(true);
    if (next === 'save') {
      setEditing(undefined);
      setName('');
      setExpectedOutcome('');
      setExpectedCode('');
      setExpectationSource('');
      return;
    }
    await refresh();
  }
  async function refresh(): Promise<CatalogSnapshot | undefined> {
    setNeedsReload(true);
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
    const caseDraft = editing?.draft ?? draft;
    const values = {
      name,
      draft: caseDraft,
      ...(expectedOutcome
        ? {
            expectation: {
              outcome: expectedOutcome,
              responseCode: expectedCode === '' ? null : expectedCode,
              source: expectationSource,
            },
          }
        : {}),
    };
    const parsed = parseCaseValues(values);
    if (!caseDraft || !parsed) {
      setError(
        'Escribe un nombre de hasta 80 caracteres, sin datos de tarjeta ni secretos. Revisa la expectativa y su fuente; el código debe tener dos caracteres.',
      );
      return;
    }
    setBusy(true);
    setError('');
    const result = await client.call((api) =>
      api.saveCase({
        environment: caseDraft.environment,
        id: editing?.id ?? null,
        revision: editing?.revision ?? null,
        values: parsed,
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
    setMessage(
      'Caso guardado. La expectativa declarada se evaluará solo contra una ejecución nueva de este caso.',
    );
  }
  async function load(saved: SavedCase) {
    if (busy || needsReload) return;
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
      current,
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
        <h2 id="case-dialog-title">
          {mode === 'save'
            ? editing
              ? 'Editar expectativa del caso'
              : 'Guardar caso local'
            : 'Casos guardados'}
        </h2>
        <p>
          Borradores de {draft?.environment}. Las expectativas son declaradas por el operador;
          guardar o cargar un caso no habilita el envío.
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
            <label>
              Resultado esperado del host
              <select
                value={expectedOutcome}
                disabled={busy}
                onChange={(event) => setExpectedOutcome(event.target.value)}
              >
                <option value="">Sin expectativa</option>
                <option value="APPROVED">Aprobado</option>
                <option value="NOT_APPROVED">No aprobado</option>
              </select>
            </label>
            {expectedOutcome && (
              <>
                <label>
                  Código de respuesta esperado (opcional)
                  <input
                    value={expectedCode}
                    maxLength={2}
                    disabled={busy}
                    onChange={(event) => setExpectedCode(event.target.value)}
                  />
                </label>
                <label>
                  Fuente de la expectativa
                  <input
                    value={expectationSource}
                    maxLength={120}
                    disabled={busy}
                    placeholder="Documento o evidencia QA aprobada"
                    onChange={(event) => setExpectationSource(event.target.value)}
                  />
                </label>
              </>
            )}
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
                {busy ? 'Guardando…' : editing ? 'Guardar expectativa' : 'Guardar caso'}
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
            {!deleting && !!catalog?.cases.length && (
              <div className="case-filters" aria-label="Filtros de casos">
                <label>
                  Buscar caso
                  <input
                    type="search"
                    maxLength={80}
                    value={filters.query}
                    disabled={busy}
                    placeholder="Nombre, ATM, cuenta o monto"
                    onChange={(event) => {
                      if (isRestrictedCaseText(event.target.value)) {
                        setFilters({ ...filters, query: '' });
                        setFilterError('No incluyas datos de tarjeta ni secretos en la búsqueda.');
                      } else {
                        setFilterError('');
                        setFilters({ ...filters, query: event.target.value });
                      }
                    }}
                  />
                </label>
                <label>
                  Operación del caso
                  <select
                    value={filters.transaction}
                    disabled={busy}
                    onChange={(event) => {
                      const transaction =
                        transactions.find((item) => item.id === event.target.value)?.id ?? 'ALL';
                      setFilters({ ...filters, transaction });
                    }}
                  >
                    <option value="ALL">Todas</option>
                    {transactions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Perfil ATM del caso
                  <select
                    value={filters.atm}
                    disabled={busy}
                    onChange={(event) => {
                      const atm = event.target.value;
                      if (atm === 'ALL' || atm === 'CURRENT' || atm === 'STALE')
                        setFilters({ ...filters, atm });
                    }}
                  >
                    <option value="ALL">Todos</option>
                    <option value="CURRENT">Vigente en catálogo</option>
                    <option value="STALE">Pendiente de actualizar</option>
                  </select>
                </label>
                <div className="case-filter-count" role="status">
                  {filteredCases.length} de {catalog?.cases.length ?? 0} casos
                  {filtersActive && (
                    <button className="text-button" disabled={busy} onClick={clearFilters}>
                      Limpiar filtros
                    </button>
                  )}
                </div>
                {filterError && (
                  <p className="catalog-form-error" role="alert">
                    {filterError}
                  </p>
                )}
              </div>
            )}
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
            ) : !filteredCases.length ? (
              <div className="case-filter-empty">
                <h3>Sin casos para estos filtros</h3>
                <button className="text-button" disabled={busy} onClick={clearFilters}>
                  Mostrar todos los casos
                </button>
              </div>
            ) : (
              <ul className="saved-case-list">
                {filteredCases.map((saved) => (
                  <li key={saved.id}>
                    <div>
                      <strong>{saved.name}</strong>
                      <small>
                        {transactions.find((item) => item.id === saved.draft.transaction)?.label} ·{' '}
                        {scenarios.find((item) => item.id === saved.draft.scenario)?.label} ·
                        Borrador · v{saved.revision}
                      </small>
                      <small>
                        {accountTypes.find((item) => item.id === saved.draft.account)?.label ??
                          'Original pendiente'}
                        {saved.draft.amount ? ' · ' + saved.draft.amount : ''}
                      </small>
                      <small>{new Date(saved.updatedAt).toLocaleString('es-EC')}</small>
                      <small>
                        {saved.expectation
                          ? `Esperado: ${saved.expectation.outcome === 'APPROVED' ? 'Aprobado' : 'No aprobado'}${saved.expectation.responseCode ? ` · RC ${saved.expectation.responseCode}` : ''}`
                          : 'Sin expectativa de resultado'}
                      </small>
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
                        disabled={busy || needsReload || !caseAtmAvailable(saved, catalog)}
                        aria-label={`Editar expectativa de ${saved.name}`}
                        onClick={() => {
                          setEditing(saved);
                          setName(saved.name);
                          setExpectedOutcome(saved.expectation?.outcome ?? '');
                          setExpectedCode(saved.expectation?.responseCode ?? '');
                          setExpectationSource(saved.expectation?.source ?? '');
                          setMode('save');
                        }}
                      >
                        Expectativa
                      </button>
                      <button
                        disabled={busy || needsReload}
                        aria-label={`Cargar ${saved.name}`}
                        onClick={() => void load(saved)}
                      >
                        Cargar
                      </button>
                      <button
                        disabled={busy || needsReload}
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
