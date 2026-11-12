import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  catalogLimits,
  networkTypes,
  entityMemberTypes,
  entityMemberLabels,
  parseAtmValues,
  parseEntityValues,
  isRestrictedCatalogText,
  cloneAtmDraft,
} from '../../../../packages/domain/src/catalogs';
import type {
  AtmProfile,
  AtmValues,
  CatalogSnapshot,
  Entity,
  EntityValues,
  NetworkType,
} from '../../../../packages/domain/src/catalogs';
import type { Environment } from '../../../../packages/domain/src/index';
import type { CatalogCommand } from '../../../../packages/shared/src/catalog-worker';
import type { ErrorCode } from '../../../../packages/shared/src/contracts';
import { Icon } from './Icon';
import { duplicateAtmTerminal, matchesAtmSearch } from './atm-catalog';

export type CatalogMutation = Exclude<CatalogCommand, { kind: 'list' }>;
interface Props {
  kind: 'entities' | 'atms';
  environment: Environment | undefined;
  catalog: CatalogSnapshot | undefined;
  loading: boolean;
  disabled: boolean;
  error: { code: ErrorCode; message: string } | undefined;
  onRefresh(): Promise<void>;
  onMutate(command: CatalogMutation): Promise<boolean>;
  onEditingChange(editing: boolean): void;
  quickCreate?: boolean;
  initialEntityId?: string | undefined;
  onCancelCreation?: (() => void) | undefined;
  onCreateQaAtm?: (() => void) | undefined;
  onVerifyQaAtm?: ((atm: AtmProfile) => void) | undefined;
}
type EntityForm = Omit<EntityValues, 'networkType'> & { networkType: NetworkType | '' };
interface Editor {
  id: string | null;
  revision: number | null;
  entity: EntityForm;
  atm: AtmValues;
}
const blankEntity: EntityForm = {
  code: '',
  name: '',
  networkType: '',
  active: true,
  memberTypes: [],
};
const blankAtm: AtmValues = {
  alias: '',
  entityId: '',
  terminalId: '',
  acquirerId: '',
  active: true,
};

export function CatalogView({
  kind,
  environment,
  catalog,
  loading,
  disabled,
  error,
  onRefresh,
  onMutate,
  onEditingChange,
  quickCreate = false,
  initialEntityId,
  onCancelCreation,
  onCreateQaAtm,
  onVerifyQaAtm,
}: Props) {
  const templateAtm =
    environment === 'QA'
      ? catalog?.atms.find(
          (atm) =>
            atm.active &&
            atm.terminalId === 'ATM20521' &&
            catalog.entities.some(
              (entity) => entity.id === atm.entityId && entity.active && entity.code === '205',
            ),
        )
      : undefined;
  function newAtm(entityId?: string): AtmValues {
    const selected = entityId ?? templateAtm?.entityId ?? '';
    return {
      ...blankAtm,
      entityId: selected,
      acquirerId: templateAtm?.entityId === selected ? templateAtm.acquirerId : '',
    };
  }
  const [editor, setEditor] = useState<Editor | undefined>(() =>
    quickCreate
      ? {
          id: null,
          revision: null,
          entity: { ...blankEntity },
          atm: newAtm(
            catalog?.entities.find((entity) => entity.id === initialEntityId && entity.active)?.id,
          ),
        }
      : undefined,
  );
  const baseline = useRef(editor);
  const [confirmRefresh, setConfirmRefresh] = useState(false);
  const refreshDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState<Entity | AtmProfile>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [memberFilter, setMemberFilter] = useState('ALL');
  const [page, setPage] = useState(0);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const entitiesView = kind === 'entities';
  const entitiesById = new Map(catalog?.entities.map((entity) => [entity.id, entity]));
  const atmProfiles = catalog?.atms.filter((atm) => atm.environment === environment) ?? [];
  const inactiveEntityCount = atmProfiles.filter(
    (atm) => !entitiesById.get(atm.entityId)?.active,
  ).length;
  const duplicateTerminal =
    !!editor &&
    !entitiesView &&
    duplicateAtmTerminal(atmProfiles, editor.atm.terminalId, environment, editor.id);
  const qaTemplateEntity =
    environment === 'QA' && entitiesById.get(editor?.atm.entityId ?? '')?.code === '205';
  const originalEntity = entitiesView
    ? catalog?.entities.find((entity) => entity.id === editor?.id)
    : undefined;
  const linkedAtmCount = originalEntity
    ? (catalog?.atms.filter(
        (atm) => atm.entityId === originalEntity.id && atm.environment === environment,
      ).length ?? 0)
    : 0;
  const showCodeImpact =
    linkedAtmCount > 0 &&
    !!editor?.entity.code.trim() &&
    editor.entity.code.trim() !== originalEntity?.code;
  const blocked =
    disabled ||
    loading ||
    confirmRefresh ||
    !catalog ||
    !environment ||
    Boolean(
      error &&
      ['TIMEOUT', 'CONFLICT', 'NOT_FOUND', 'STORAGE_UNAVAILABLE', 'SERVICE_UNAVAILABLE'].includes(
        error.code,
      ),
    );
  useEffect(() => {
    onEditingChange(Boolean(editor || deleting || confirmRefresh));
    return () => onEditingChange(false);
  }, [editor, deleting, confirmRefresh, onEditingChange]);
  useEffect(() => {
    if (deleting) dialog.current?.showModal();
    else dialog.current?.close();
  }, [deleting]);

  useEffect(() => {
    if (confirmRefresh) refreshDialog.current?.showModal();
    else refreshDialog.current?.close();
  }, [confirmRefresh]);
  const editorDirty =
    !!editor &&
    JSON.stringify(entitiesView ? editor.entity : editor.atm) !==
      JSON.stringify(entitiesView ? baseline.current?.entity : baseline.current?.atm);
  function closeRefreshDialog() {
    refreshDialog.current?.close();
    setConfirmRefresh(false);
  }
  function requestRefresh() {
    if (editorDirty) setConfirmRefresh(true);
    else void refresh();
  }

  const filtersApplied =
    !!search ||
    status !== 'ALL' ||
    (!entitiesView && entityFilter !== 'ALL') ||
    (entitiesView && memberFilter !== 'ALL');
  function clearFilters() {
    setSearch('');
    setStatus('ALL');
    setEntityFilter('ALL');
    setMemberFilter('ALL');
    setPage(0);
  }
  const rows = (entitiesView ? (catalog?.entities ?? []) : atmProfiles).filter((item) => {
    const matchesSearch =
      'name' in item
        ? `${item.code} ${item.name}`
            .toLocaleLowerCase()
            .includes(search.trim().toLocaleLowerCase())
        : matchesAtmSearch(item, entitiesById.get(item.entityId), search);
    return (
      matchesSearch &&
      (!('name' in item) ||
        memberFilter === 'ALL' ||
        (memberFilter === 'UNCLASSIFIED'
          ? !item.memberTypes?.length
          : memberFilter === 'REVIEW'
            ? (item.memberTypes?.length ?? 0) > 1
            : item.memberTypes?.some((type) => type === memberFilter))) &&
      ('name' in item || entityFilter === 'ALL' || item.entityId === entityFilter) &&
      (status === 'ALL' ||
        (status === 'ENTITY_INACTIVE'
          ? 'alias' in item && !entitiesById.get(item.entityId)?.active
          : item.active === (status === 'ACTIVE')))
    );
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / 15));
  const currentPage = Math.min(page, totalPages - 1);

  function edit(item?: Entity | AtmProfile, clone = false) {
    setNotice('');
    setFormError('');
    const next: Editor = {
      id: clone ? null : (item?.id ?? null),
      revision: clone ? null : (item?.revision ?? null),
      entity:
        item && 'name' in item
          ? {
              code: item.code,
              name: item.name,
              networkType: item.networkType,
              active: item.active,
              memberTypes: item.memberTypes ?? [],
            }
          : { ...blankEntity },
      atm:
        item && 'alias' in item && clone
          ? cloneAtmDraft(item)
          : item && 'alias' in item
            ? {
                alias: item.alias,
                entityId: item.entityId,
                terminalId: item.terminalId,
                acquirerId: item.acquirerId,
                active: item.active,
              }
            : newAtm(),
    };
    baseline.current = next;
    setEditor(next);
  }

  function textField(
    field: 'code' | 'name' | 'alias' | 'terminalId' | 'acquirerId',
    value: string,
  ) {
    if (!editor) return;
    const restricted = isRestrictedCatalogText(value);
    setFormError(
      restricted
        ? 'No incluyas datos de tarjeta, secretos ni caracteres de control. Completa de nuevo el campo.'
        : '',
    );
    const accepted = restricted ? '' : value;
    setEditor(
      entitiesView
        ? { ...editor, entity: { ...editor.entity, [field]: accepted } }
        : { ...editor, atm: { ...editor.atm, [field]: accepted } },
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!editor || !environment || blocked) return;
    const metadata = { environment, id: editor.id, revision: editor.revision };
    let command: CatalogMutation;
    if (entitiesView) {
      const values = parseEntityValues(editor.entity);
      if (!values) {
        setFormError('Completa el código, nombre y red con valores válidos.');
        return;
      }
      command = { kind: 'saveEntity', request: { ...metadata, values } };
    } else {
      if (duplicateTerminal) {
        setFormError('El Terminal ID ya existe en este ambiente. Usa otro identificador.');
        return;
      }
      const values = parseAtmValues(editor.atm);
      if (!values) {
        setFormError('Completa el alias, entidad, Terminal ID y Acquirer ID.');
        return;
      }
      if (
        environment === 'QA' &&
        catalog?.entities.some(
          (entity) => entity.id === values.entityId && entity.code === '205',
        ) &&
        (!/^[A-Z0-9]{8}$/.test(values.terminalId) || !/^\d{1,11}$/.test(values.acquirerId))
      ) {
        setFormError(
          'Para enviar en QA, usa un Terminal ID de ocho letras mayúsculas o dígitos y un Acquirer ID numérico de hasta once dígitos.',
        );
        return;
      }
      command = { kind: 'saveAtm', request: { ...metadata, values } };
    }
    if (await onMutate(command)) {
      setEditor(undefined);
      setNotice('Cambios guardados como borrador.');
    }
  }

  async function remove() {
    if (!deleting || !environment || blocked) return;
    if (
      await onMutate({
        kind: entitiesView ? 'deleteEntity' : 'deleteAtm',
        request: { environment, id: deleting.id, revision: deleting.revision },
      })
    ) {
      setDeleting(undefined);
      setNotice('Registro eliminado del catálogo.');
    }
  }

  async function refresh() {
    closeRefreshDialog();
    baseline.current = undefined;
    setFormError('');
    setEditor(undefined);
    setDeleting(undefined);
    setNotice('');
    await onRefresh();
  }

  return (
    <>
      <section className={`panel catalog-panel ${editor ? 'is-editing' : ''}`}>
        <div className="catalog-heading" hidden={!!editor}>
          <div>
            <h2>
              {entitiesView
                ? 'Catálogo de entidades'
                : `Catálogo ATM · ${environment ?? 'Sin verificar'}`}
            </h2>
            <p>
              {entitiesView
                ? 'Entidades del ambiente Qa.'
                : 'Administra tus cajeros de prueba, su entidad y sus identificadores.'}
            </p>
          </div>
          <div className="catalog-actions">
            {!entitiesView && onCreateQaAtm && (
              <button className="primary" disabled={blocked || !!editor} onClick={onCreateQaAtm}>
                Crear ATM QA/205
              </button>
            )}
            <button onClick={requestRefresh} disabled={loading || disabled}>
              Recargar
            </button>
            <button
              className="primary"
              onClick={() => edit()}
              disabled={
                blocked ||
                Boolean(editor) ||
                (!entitiesView && !catalog?.entities.some((entity) => entity.active))
              }
            >
              <span aria-hidden="true">+</span>
              {entitiesView ? 'Nueva entidad' : 'Nuevo perfil ATM'}
            </button>
          </div>
        </div>
        <div className="catalog-draft" hidden={!!editor}>
          <Icon name="shield" size={17} />
          <span>
            {entitiesView
              ? 'Catálogo local · validación pendiente'
              : 'Activo es un estado del catálogo. La configuración de envío y la aceptación del host se verifican por separado.'}
          </span>
        </div>
        {!entitiesView && !editor && catalog && (
          <dl
            className="atm-catalog-summary"
            aria-label="Resumen de perfiles ATM"
            aria-busy={loading}
          >
            <div>
              <dt>Perfiles en Qa</dt>
              <dd>{atmProfiles.length}</dd>
            </div>
            <div>
              <dt>Activos</dt>
              <dd>{atmProfiles.filter((atm) => atm.active).length}</dd>
            </div>
            <div>
              <dt>Inactivos</dt>
              <dd>{atmProfiles.filter((atm) => !atm.active).length}</dd>
            </div>
            <div className={inactiveEntityCount ? 'needs-attention' : ''}>
              <dt>Entidad no disponible</dt>
              <dd>{inactiveEntityCount}</dd>
            </div>
          </dl>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <div>
              <strong>{error.message}</strong>
              <details>
                <summary>Detalle técnico</summary>
                <code>{error.code}</code>
              </details>
            </div>
          </div>
        )}
        {notice && (
          <div className="catalog-notice" role="status">
            <Icon name="check" size={16} />
            {notice}
          </div>
        )}
        {editor && (
          <form className="catalog-editor" onSubmit={(event) => void save(event)}>
            <div className="panel-heading">
              <h2>
                {editor.id
                  ? entitiesView
                    ? 'Editar entidad'
                    : 'Editar perfil ATM'
                  : entitiesView
                    ? 'Crear entidad'
                    : 'Crear perfil ATM'}
              </h2>
              <div className="catalog-actions">
                <span className="pill blue">{environment} · Borrador</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={requestRefresh}
                  disabled={loading || disabled}
                >
                  Recargar
                </button>
              </div>
            </div>
            <fieldset disabled={blocked}>
              <div className="form-grid">
                {entitiesView ? (
                  <>
                    <label>
                      Código de entidad
                      <input
                        autoFocus
                        required
                        maxLength={catalogLimits.code}
                        aria-describedby={showCodeImpact ? 'entity-code-impact' : undefined}
                        value={editor.entity.code}
                        onChange={(event) => textField('code', event.target.value)}
                      />
                    </label>
                    <label>
                      Nombre de entidad
                      <input
                        required
                        maxLength={catalogLimits.text}
                        value={editor.entity.name}
                        onChange={(event) => textField('name', event.target.value)}
                      />
                    </label>
                    <label>
                      Red de entidad
                      <select
                        required
                        value={editor.entity.networkType}
                        onChange={(event) => {
                          const networkType =
                            networkTypes.find((type) => type === event.target.value) ?? '';
                          setEditor({ ...editor, entity: { ...editor.entity, networkType } });
                        }}
                      >
                        <option value="">Selecciona una red</option>
                        {networkTypes.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    <fieldset className="entity-member-types">
                      <legend>Clasificación de la entidad</legend>
                      <div className="catalog-actions">
                        {entityMemberTypes.map((type) => (
                          <label key={type} className="checkbox-field">
                            <input
                              type="checkbox"
                              checked={editor.entity.memberTypes?.includes(type) ?? false}
                              onChange={(event) =>
                                setEditor({
                                  ...editor,
                                  entity: {
                                    ...editor.entity,
                                    memberTypes: entityMemberTypes.filter((candidate) =>
                                      candidate === type
                                        ? event.target.checked
                                        : editor.entity.memberTypes?.includes(candidate),
                                    ),
                                  },
                                })
                              }
                            />
                            {entityMemberLabels[type]}
                          </label>
                        ))}
                      </div>
                      <small>
                        Sin selección: sin clasificar. Varias clasificaciones se conservan con
                        validación pendiente.
                      </small>
                    </fieldset>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={editor.entity.active}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            entity: { ...editor.entity, active: event.target.checked },
                          })
                        }
                      />
                      Entidad activa
                    </label>
                  </>
                ) : (
                  <>
                    <label>
                      Alias ATM
                      <input
                        autoFocus
                        required
                        maxLength={catalogLimits.text}
                        value={editor.atm.alias}
                        onChange={(event) => textField('alias', event.target.value)}
                      />
                    </label>
                    <label>
                      Entidad del ATM
                      <select
                        required
                        value={editor.atm.entityId}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            atm: {
                              ...editor.atm,
                              entityId: event.target.value,
                              ...(!editor.id
                                ? { acquirerId: newAtm(event.target.value).acquirerId }
                                : {}),
                            },
                          })
                        }
                      >
                        <option value="">Selecciona una entidad</option>
                        {catalog?.entities.map((entity) => (
                          <option
                            key={entity.id}
                            value={entity.id}
                            disabled={!entity.active && entity.id !== editor.atm.entityId}
                          >
                            {entity.code} · {entity.name}
                            {!entity.active ? ' (inactiva)' : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Terminal ID
                      <input
                        required
                        maxLength={catalogLimits.text}
                        aria-invalid={duplicateTerminal || undefined}
                        aria-describedby="atm-terminal-help"
                        aria-label="Terminal ID"
                        value={editor.atm.terminalId}
                        onChange={(event) => textField('terminalId', event.target.value)}
                      />
                      <small
                        id="atm-terminal-help"
                        className={duplicateTerminal ? 'atm-field-error' : 'atm-field-help'}
                      >
                        {duplicateTerminal
                          ? 'Este Terminal ID ya existe en Qa; elige uno distinto.'
                          : qaTemplateEntity
                            ? '8 letras mayúsculas o dígitos. Debe ser único en Qa.'
                            : 'Identificador único del terminal en Qa.'}
                      </small>
                    </label>
                    <label>
                      Acquirer ID
                      <input
                        required
                        maxLength={catalogLimits.text}
                        aria-describedby="atm-acquirer-help"
                        aria-label="Acquirer ID"
                        value={editor.atm.acquirerId}
                        onChange={(event) => textField('acquirerId', event.target.value)}
                      />
                      <small id="atm-acquirer-help" className="atm-field-help">
                        {qaTemplateEntity
                          ? 'Numérico, hasta 11 dígitos. Se hereda al crear desde ATM20521 o clonar.'
                          : 'Identificador del adquirente según la configuración aprobada.'}
                      </small>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={editor.atm.active}
                        onChange={(event) =>
                          setEditor({
                            ...editor,
                            atm: { ...editor.atm, active: event.target.checked },
                          })
                        }
                      />
                      Perfil ATM activo
                    </label>
                  </>
                )}
              </div>
            </fieldset>
            {showCodeImpact && (
              <p id="entity-code-impact" className="catalog-warning" role="status">
                <strong>Impacto del cambio de código.</strong> Esta entidad tiene {linkedAtmCount}{' '}
                {linkedAtmCount === 1 ? 'perfil ATM asociado' : 'perfiles ATM asociados'} en Qa. Los
                perfiles seguirán vinculados a esta entidad.
                {environment === 'QA' && originalEntity?.code === '205' && (
                  <>
                    {' '}
                    Al guardar un código distinto de 205, estos perfiles dejarán de poder utilizar
                    la plantilla ATM20521 para ejecutar transacciones.
                  </>
                )}
              </p>
            )}
            {formError && (
              <p className="catalog-form-error" role="alert">
                {formError}
              </p>
            )}
            <p className="form-note">
              {entitiesView
                ? 'Guarda o cancela antes de salir.'
                : environment === 'QA' &&
                    catalog?.entities.some(
                      (entity) => entity.id === editor.atm.entityId && entity.code === '205',
                    )
                  ? 'Los perfiles QA/205 pueden heredar la configuración de ATM20521 y compartir sus reservas; una configuración específica tiene prioridad. La aplicación verifica los requisitos al operar. El terminal debe estar habilitado en el switch.'
                  : 'La herencia de ATM20521 aplica a QA/205. Guardar este perfil no acredita una configuración de envío.'}
            </p>
            <details className="inline-details">
              <summary>Detalles del perfil</summary>
              <p className="form-note">
                {entitiesView
                  ? 'La clasificación FRONT/BACK/EXTERNA/HÍBRIDA es administrativa y se conserva separada de la red. No determina el escenario ni la ruta de envío.'
                  : 'Se eliminan espacios de los extremos; no se añade padding. Para QA/205 se comprueban los formatos de Terminal ID y Acquirer ID documentados.'}{' '}
              </p>
            </details>
            <div className="catalog-actions editor-actions">
              <button
                type="button"
                onClick={() => {
                  setEditor(undefined);
                  setFormError('');
                  onCancelCreation?.();
                }}
                disabled={loading}
              >
                Cancelar
              </button>
              <button className="primary" type="submit" disabled={blocked}>
                {loading ? 'Guardando…' : 'Guardar borrador'}
              </button>
            </div>
          </form>
        )}
        {!editor && formError && (
          <p className="catalog-form-error" role="alert">
            {formError}
          </p>
        )}
        <div hidden={!!editor}>
          <div className="catalog-filters">
            <label className="search-field">
              <span>Buscar {entitiesView ? 'entidad' : 'ATM'}</span>
              <input
                type="search"
                maxLength={catalogLimits.text}
                value={search}
                placeholder={
                  entitiesView ? 'Código o nombre' : 'Alias, terminal, adquirente o entidad'
                }
                onChange={(event) => {
                  if (isRestrictedCatalogText(event.target.value)) {
                    setFormError(
                      'No incluyas datos de tarjeta ni caracteres de control en la búsqueda.',
                    );
                    return;
                  }
                  setFormError('');
                  setSearch(event.target.value);
                  setPage(0);
                }}
              />
            </label>
            {entitiesView && (
              <label>
                Filtrar por clasificación
                <select
                  value={memberFilter}
                  onChange={(event) => {
                    setMemberFilter(event.target.value);
                    setPage(0);
                  }}
                >
                  <option value="ALL">Todas las clasificaciones</option>
                  {entityMemberTypes.map((type) => (
                    <option key={type} value={type}>
                      {entityMemberLabels[type]}
                    </option>
                  ))}
                  <option value="REVIEW">Validación pendiente</option>
                  <option value="UNCLASSIFIED">Sin clasificar</option>
                </select>
              </label>
            )}
            {!entitiesView && (
              <label>
                Filtrar por entidad
                <select
                  aria-label="Filtrar por entidad"
                  value={entityFilter}
                  onChange={(event) => {
                    setEntityFilter(event.target.value);
                    setPage(0);
                  }}
                >
                  <option value="ALL">Todas las entidades</option>
                  {catalog?.entities.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.code} · {entity.name}
                      {!entity.active ? ' (inactiva)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Estado
              <select
                aria-label="Estado"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(0);
                }}
              >
                <option value="ALL">Todos</option>
                <option value="ACTIVE">Activos</option>
                <option value="INACTIVE">Inactivos</option>
                {!entitiesView && <option value="ENTITY_INACTIVE">Entidad no disponible</option>}
              </select>
            </label>
            {filtersApplied && <button onClick={clearFilters}>Limpiar filtros</button>}
            <span className="catalog-count">
              {rows.length} {rows.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>
          {loading && (
            <p className="form-note" role="status">
              Cargando catálogo…
            </p>
          )}
          {!loading && catalog && rows.length === 0 && (
            <div className="empty-state compact">
              <span className="empty-icon">
                <Icon name={entitiesView ? 'entity' : 'atm'} size={30} />
              </span>
              <h3>
                {filtersApplied
                  ? 'Sin resultados para este filtro'
                  : entitiesView
                    ? 'Crea tu primera entidad de prueba'
                    : 'Aún no hay perfiles ATM en este ambiente'}
              </h3>
              <p>
                {filtersApplied
                  ? 'Prueba otra búsqueda o limpia los filtros para ver el catálogo completo.'
                  : entitiesView
                    ? 'Usa datos del catálogo aprobado del proyecto.'
                    : catalog.entities.some((entity) => entity.active)
                      ? 'Selecciona Nuevo perfil ATM para añadirlo.'
                      : 'Crea una entidad activa antes de añadir perfiles ATM.'}
              </p>
            </div>
          )}
          {rows.length > 0 && (
            <div className="catalog-table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>{entitiesView ? 'Código' : 'Alias'}</th>
                    <th>{entitiesView ? 'Entidad' : 'Terminal ID'}</th>
                    <th>{entitiesView ? 'Red' : 'Entidad'}</th>
                    {entitiesView && <th>Clasificación</th>}
                    {!entitiesView && <th>Acquirer ID</th>}
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(currentPage * 15, (currentPage + 1) * 15).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{'name' in item ? item.code : item.alias}</strong>
                        <small>Borrador · v{item.revision}</small>
                      </td>
                      <td>{'name' in item ? item.name : item.terminalId}</td>
                      <td>
                        {'name' in item ? (
                          <span className="pill blue">{item.networkType}</span>
                        ) : (
                          <>
                            {entitiesById.get(item.entityId)?.name ?? 'Entidad no disponible'}
                            <small>{entitiesById.get(item.entityId)?.code}</small>
                            {!entitiesById.get(item.entityId)?.active && (
                              <span className="atm-entity-warning">
                                Entidad no disponible · no seleccionable
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      {'alias' in item && <td>{item.acquirerId}</td>}
                      {'name' in item && (
                        <td>
                          {item.memberTypes?.length ? (
                            <div className="entity-classifications">
                              {item.memberTypes.map((type) => (
                                <span className="pill blue" key={type}>
                                  {entityMemberLabels[type]}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="pill neutral">Sin clasificar</span>
                          )}
                          {(item.memberTypes?.length ?? 0) > 1 && (
                            <small className="atm-entity-warning">Validación pendiente</small>
                          )}
                        </td>
                      )}
                      <td>
                        <span className={`pill ${item.active ? 'green' : 'neutral'}`}>
                          {item.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            disabled={blocked || Boolean(editor)}
                            onClick={() => edit(item)}
                            aria-label={`Editar ${'name' in item ? item.code : item.alias}`}
                          >
                            Editar
                          </button>
                          {'alias' in item && (
                            <button
                              disabled={
                                blocked ||
                                !!editor ||
                                entitiesById.get(item.entityId)?.code !== '205'
                              }
                              onClick={() => onVerifyQaAtm?.(item)}
                              aria-label={`Verificar ${item.alias}`}
                            >
                              Verificar y probar
                            </button>
                          )}
                          {'alias' in item && (
                            <button
                              disabled={blocked || Boolean(editor)}
                              onClick={() => edit(item, true)}
                              aria-label={`Clonar ${item.alias}`}
                            >
                              Clonar
                            </button>
                          )}
                          <button
                            className="danger-text"
                            disabled={blocked || Boolean(editor)}
                            onClick={() => {
                              setNotice('');
                              setDeleting(item);
                            }}
                            aria-label={`Eliminar ${'name' in item ? item.code : item.alias}`}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="catalog-pagination">
              <span>
                Página {currentPage + 1} de {totalPages}
              </span>
              <button disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                Anterior
              </button>
              <button
                disabled={currentPage + 1 >= totalPages}
                onClick={() => setPage(currentPage + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="panel audit-panel catalog-audit" hidden={!!editor}>
        <div className="panel-heading">
          <h2>Actividad del catálogo</h2>
          <span className="pill neutral">Auditoría local</span>
        </div>
        {catalog?.audit.length ? (
          <div className="catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha local</th>
                  <th>Recurso</th>
                  <th>Acción</th>
                  <th>Ambiente</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {catalog.audit.slice(0, 10).map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleString('es-EC')}</td>
                    <td>
                      {entry.resource === 'ENTITY'
                        ? 'Entidad'
                        : entry.resource === 'ATM'
                          ? 'ATM'
                          : 'Caso'}
                    </td>
                    <td>
                      {
                        { CREATED: 'Creado', UPDATED: 'Actualizado', DELETED: 'Eliminado' }[
                          entry.action
                        ]
                      }
                    </td>
                    <td>{entry.environment}</td>
                    <td>{entry.user}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="form-note">Sin cambios registrados en el catálogo.</p>
        )}
      </section>
      <dialog
        className="catalog-dialog"
        ref={refreshDialog}
        aria-labelledby="catalog-refresh-title"
        onCancel={(event) => {
          event.preventDefault();
          closeRefreshDialog();
        }}
      >
        <h2 id="catalog-refresh-title">¿Descartar cambios y recargar?</h2>
        <p>
          Se perderán los cambios sin guardar del formulario. Los registros guardados se conservan.
        </p>
        <div className="catalog-actions">
          <button autoFocus onClick={closeRefreshDialog}>
            Seguir editando
          </button>
          <button className="danger" disabled={loading || disabled} onClick={() => void refresh()}>
            Descartar y recargar
          </button>
        </div>
      </dialog>
      <dialog
        className="catalog-dialog"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          if (!loading) setDeleting(undefined);
        }}
        aria-labelledby="delete-title"
      >
        <h2 id="delete-title">Eliminar {entitiesView ? 'entidad' : 'perfil ATM'}</h2>
        <p>
          Se eliminará{' '}
          <strong>{deleting && ('name' in deleting ? deleting.code : deleting.alias)}</strong> del
          catálogo local.
        </p>
        {error && (
          <p className="catalog-form-error" role="alert">
            {error.message}
          </p>
        )}
        <div className="catalog-actions">
          <button onClick={() => setDeleting(undefined)} disabled={loading}>
            Cancelar
          </button>
          <button className="danger" onClick={() => void remove()} disabled={blocked}>
            {loading ? 'Eliminando…' : 'Confirmar eliminación'}
          </button>
        </div>
      </dialog>
    </>
  );
}
