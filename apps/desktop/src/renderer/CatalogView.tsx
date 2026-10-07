import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  catalogLimits,
  networkTypes,
  parseAtmValues,
  parseEntityValues,
  isRestrictedCatalogText,
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
}
type EntityForm = Omit<EntityValues, 'networkType'> & { networkType: NetworkType | '' };
interface Editor {
  id: string | null;
  revision: number | null;
  entity: EntityForm;
  atm: AtmValues;
}
const blankEntity: EntityForm = { code: '', name: '', networkType: '', active: true };
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
}: Props) {
  const [editor, setEditor] = useState<Editor>();
  const [deleting, setDeleting] = useState<Entity | AtmProfile>();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(0);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const entitiesView = kind === 'entities';
  const blocked =
    disabled ||
    loading ||
    !catalog ||
    !environment ||
    Boolean(
      error &&
      ['TIMEOUT', 'CONFLICT', 'NOT_FOUND', 'STORAGE_UNAVAILABLE', 'SERVICE_UNAVAILABLE'].includes(
        error.code,
      ),
    );
  useEffect(() => {
    onEditingChange(Boolean(editor || deleting));
    return () => onEditingChange(false);
  }, [editor, deleting, onEditingChange]);
  useEffect(() => {
    if (deleting) dialog.current?.showModal();
    else dialog.current?.close();
  }, [deleting]);

  const rows = (entitiesView ? (catalog?.entities ?? []) : (catalog?.atms ?? [])).filter((item) => {
    const text =
      'name' in item
        ? `${item.code} ${item.name}`
        : `${item.alias} ${item.terminalId} ${catalog?.entities.find((entity) => entity.id === item.entityId)?.name ?? ''}`;
    return (
      text.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (status === 'ALL' || item.active === (status === 'ACTIVE'))
    );
  });
  const totalPages = Math.max(1, Math.ceil(rows.length / 15));
  const currentPage = Math.min(page, totalPages - 1);

  function edit(item?: Entity | AtmProfile) {
    setNotice('');
    setFormError('');
    setEditor({
      id: item?.id ?? null,
      revision: item?.revision ?? null,
      entity:
        item && 'name' in item
          ? { code: item.code, name: item.name, networkType: item.networkType, active: item.active }
          : { ...blankEntity },
      atm:
        item && 'alias' in item
          ? {
              alias: item.alias,
              entityId: item.entityId,
              terminalId: item.terminalId,
              acquirerId: item.acquirerId,
              active: item.active,
            }
          : { ...blankAtm },
    });
  }

  function textField(
    field: 'code' | 'name' | 'alias' | 'terminalId' | 'acquirerId',
    value: string,
  ) {
    if (!editor) return;
    if (isRestrictedCatalogText(value)) {
      setFormError('No incluyas datos de tarjeta, secretos ni caracteres de control.');
      return;
    }
    setFormError('');
    setEditor(
      entitiesView
        ? { ...editor, entity: { ...editor.entity, [field]: value } }
        : { ...editor, atm: { ...editor.atm, [field]: value } },
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
      const values = parseAtmValues(editor.atm);
      if (!values) {
        setFormError('Completa el alias, entidad, Terminal ID y Acquirer ID.');
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
    setEditor(undefined);
    setDeleting(undefined);
    setNotice('');
    await onRefresh();
  }

  return (
    <>
      <section className="panel catalog-panel">
        <div className="catalog-heading">
          <div>
            <h2>
              {entitiesView
                ? 'Catálogo de entidades'
                : `Catálogo ATM · ${environment ?? 'Sin verificar'}`}
            </h2>
            <p>
              {entitiesView
                ? 'Entidades compartidas entre QA y PREPROD.'
                : 'Perfiles independientes para el ambiente seleccionado.'}
            </p>
          </div>
          <div className="catalog-actions">
            <button onClick={() => void refresh()} disabled={loading || disabled}>
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
        <div className="catalog-draft">
          <Icon name="shield" size={17} />
          <span>Configuración en borrador. Guardar perfiles no habilita transacciones ISO.</span>
        </div>
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
              <span className="pill blue">{environment}</span>
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
                            atm: { ...editor.atm, entityId: event.target.value },
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
                        value={editor.atm.terminalId}
                        onChange={(event) => textField('terminalId', event.target.value)}
                      />
                    </label>
                    <label>
                      Acquirer ID
                      <input
                        required
                        maxLength={catalogLimits.text}
                        value={editor.atm.acquirerId}
                        onChange={(event) => textField('acquirerId', event.target.value)}
                      />
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
            {formError && (
              <p className="catalog-form-error" role="alert">
                {formError}
              </p>
            )}
            <p className="form-note">
              {entitiesView
                ? 'La membresía FRONT/BACK/EXTERNAL está pendiente de validar entre las fuentes del proyecto.'
                : 'Los identificadores se guardan como los introduces, sin padding ni validación de formato ISO.'}{' '}
              Cierra la edición para cambiar de ambiente.
            </p>
            <div className="catalog-actions editor-actions">
              <button
                type="button"
                onClick={() => {
                  setEditor(undefined);
                  setFormError('');
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
        <div className="catalog-filters">
          <label className="search-field">
            <span>Buscar {entitiesView ? 'entidad' : 'ATM'}</span>
            <input
              type="search"
              maxLength={catalogLimits.text}
              value={search}
              placeholder={entitiesView ? 'Código o nombre' : 'Alias, terminal o entidad'}
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
          <label>
            Estado
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(0);
              }}
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activos</option>
              <option value="INACTIVE">Inactivos</option>
            </select>
          </label>
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
              {search || status !== 'ALL'
                ? 'Sin resultados para este filtro'
                : entitiesView
                  ? 'Crea tu primera entidad de prueba'
                  : 'Aún no hay perfiles ATM en este ambiente'}
            </h3>
            <p>
              {entitiesView
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
                        catalog?.entities.find((entity) => entity.id === item.entityId)?.name
                      )}
                    </td>
                    {'alias' in item && <td>{item.acquirerId}</td>}
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
      </section>
      <section className="panel audit-panel catalog-audit">
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
                    <td>{entry.resource === 'ENTITY' ? 'Entidad' : 'ATM'}</td>
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
        ref={dialog}
        onCancel={() => setDeleting(undefined)}
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
