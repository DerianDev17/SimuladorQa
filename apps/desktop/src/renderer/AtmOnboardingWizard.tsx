import { useCallback, useEffect, useRef, useState } from 'react';
import {
  catalogLimits,
  entityMemberLabels,
  isRestrictedCatalogText,
  type AtmProfile,
  type CatalogSnapshot,
} from '../../../../packages/domain/src/catalogs';
import {
  parseCreateQaAtm,
  qaAtmEntityChecks,
  type AtmLocalInspection,
  type CreateQaAtmRequest,
} from '../../../../packages/domain/src/atm-onboarding';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';
import { duplicateAtmTerminal } from './atm-catalog';
import { AtmBalanceTest } from './AtmBalanceTest';
import './atm-onboarding.css';

interface Props {
  visible: boolean;
  client: DesktopClient;
  snapshot: AppSnapshot;
  catalog: CatalogSnapshot | undefined;
  initialAtm: AtmProfile | null;
  onCatalogChange(catalog: CatalogSnapshot): void;
  onRefresh(): Promise<void>;
  onEditingChange(editing: boolean): void;
  onTestingChange(testing: boolean): void;
  onSettings(): void;
  onClose(): void;
}
const checkLabels = {
  VERIFIED: 'Verificado localmente',
  ACTION_REQUIRED: 'Requiere acción',
  NOT_CHECKED: 'No comprobado',
};
export function AtmOnboardingWizard(props: Props) {
  const { catalog, client, visible, onEditingChange } = props;
  const [alias, setAlias] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState(
    props.initialAtm?.entityId ??
      catalog?.entities.find((item) => item.code === '205' && item.active)?.id ??
      '',
  );
  const [entitySearch, setEntitySearch] = useState('');
  const [acquirerId, setAcquirerId] = useState('');
  const [rejected, setRejected] = useState({ alias: false, terminal: false, acquirer: false });
  const [atmId, setAtmId] = useState(props.initialAtm?.id);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingRequest, setPendingRequest] = useState<CreateQaAtmRequest>();
  const [inspection, setInspection] = useState<AtmLocalInspection>();
  const [inspecting, setInspecting] = useState(false);
  const [inspectionVersion, setInspectionVersion] = useState(0);
  const [testing, setTesting] = useState(false);
  const { onTestingChange } = props;
  const testingChanged = useCallback(
    (value: boolean) => {
      setTestBusy(value);
      onTestingChange(value);
    },
    [onTestingChange],
  );
  const lock = useRef(false);
  const active = useRef(true);
  const atm = catalog?.atms.find((item) => item.id === atmId);
  const entity = catalog?.entities.find((item) => item.id === (atm?.entityId ?? selectedEntityId));
  const useTemplate = entity?.code === '205';
  const entityChecks = qaAtmEntityChecks(entity);
  const entityReady = entityChecks.every((check) => check.status === 'VERIFIED');
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const entityOptions =
    catalog?.entities.filter(
      (item) =>
        item.id === selectedEntityId ||
        normalize(`${item.code} ${item.name}`).includes(normalize(entitySearch.trim())),
    ) ?? [];
  const template = catalog?.atms.find(
    (item) =>
      item.environment === 'QA' &&
      item.terminalId === 'ATM20521' &&
      item.active &&
      item.entityId === entity?.id &&
      catalog.entities.some(
        (entity) => entity.id === item.entityId && entity.code === '205' && entity.active,
      ),
  );
  const duplicate = duplicateAtmTerminal(catalog?.atms ?? [], terminalId, 'QA', null);
  const terminalValid = useTemplate ? /^[A-Z0-9]{8}$/.test(terminalId.trim()) : !!terminalId.trim();
  const verified =
    inspection?.atmId === atm?.id &&
    inspection?.revision === atm?.revision &&
    inspection?.readyForBalanceTest &&
    inspection.entity?.id === entity?.id &&
    inspection.entity?.revision === entity?.revision &&
    entityReady &&
    !inspecting;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    onEditingChange(visible);
    return () => onEditingChange(false);
  }, [visible, onEditingChange]);
  useEffect(() => {
    let current = true;
    setInspection(undefined);
    if (!visible || !atm || testing) return;
    setInspecting(true);
    setError('');
    void client
      .call((api) => api.inspectQaAtm({ environment: 'QA', atmId: atm.id, revision: atm.revision }))
      .then((result) => {
        if (!current) return;
        if (result.ok) setInspection(result.value);
        else setError(result.error.message);
        setInspecting(false);
      });
    return () => {
      current = false;
    };
  }, [atm, entity, client, visible, inspectionVersion, testing]);

  async function create() {
    if (
      lock.current ||
      rejected.alias ||
      rejected.terminal ||
      rejected.acquirer ||
      (!pendingRequest && (!entity?.active || (useTemplate && !template)))
    )
      return;
    const request =
      pendingRequest ??
      parseCreateQaAtm({
        environment: 'QA',
        requestId: crypto.randomUUID(),
        ...(useTemplate
          ? { templateId: template!.id, templateRevision: template!.revision }
          : { entityId: entity!.id, entityRevision: entity!.revision, acquirerId }),
        alias: alias.trim() || terminalId.trim(),
        terminalId: terminalId.trim(),
      });
    if (!request) {
      setError(
        'Revisa la entidad, el Terminal ID, el adquirente y el alias. Para 205, el terminal requiere ocho letras mayúsculas o dígitos.',
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    setPendingRequest(request);
    const result = await client.call((api) => api.createQaAtm(request));
    lock.current = false;
    if (!active.current) return;
    setBusy(false);
    if (result.ok) {
      props.onCatalogChange(result.value);
      setAtmId(request.requestId);
      setPendingRequest(undefined);
    } else {
      setError(result.error.message);
      if (!['TIMEOUT', 'SERVICE_UNAVAILABLE', 'STORAGE_UNAVAILABLE'].includes(result.error.code))
        setPendingRequest(undefined);
    }
  }
  async function refresh() {
    if (lock.current) return;
    setBusy(true);
    setInspection(undefined);
    await props.onRefresh();
    if (active.current) {
      setBusy(false);
      setInspectionVersion((value) => value + 1);
    }
  }
  function text(value: string, field: 'alias' | 'terminal' | 'acquirer') {
    const setter =
      field === 'alias' ? setAlias : field === 'terminal' ? setTerminalId : setAcquirerId;
    const restricted = isRestrictedCatalogText(value);
    setRejected((previous) => ({ ...previous, [field]: restricted }));
    if (restricted) {
      setter('');
      setError('No incluyas datos de tarjeta ni caracteres de control.');
    } else {
      setter(value);
      setError('');
    }
  }
  return (
    <section className="panel atm-onboarding" aria-label="Asistente ATM Qa">
      <div className="panel-heading">
        <div>
          <h2>Crear y verificar ATM</h2>
          <p>Qa · Entidad y configuración del ATM</p>
        </div>
        <button disabled={busy || testBusy} onClick={props.onClose}>
          {atmId ? 'Volver al catálogo' : 'Cancelar asistente'}
        </button>
      </div>
      <ol className="atm-wizard-steps" aria-label="Pasos del asistente">
        {['Identidad', 'Verificación local', 'Prueba de saldo'].map((label, index) => (
          <li
            key={label}
            aria-current={(testing ? 2 : atmId ? 1 : 0) === index ? 'step' : undefined}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>
      {entity && (
        <section className="atm-wizard-entity" aria-label="Entidad del ATM">
          <strong>
            {entity.code} · {entity.name}
          </strong>
          <div className="entity-classifications">
            {(entity.memberTypes ?? []).map((type) => (
              <span className="pill blue" key={type}>
                {entityMemberLabels[type]}
              </span>
            ))}
            {!entity.memberTypes?.length && <span className="pill neutral">Sin clasificar</span>}
            {(entity.memberTypes?.length ?? 0) > 1 && (
              <span className="pill amber">Validación pendiente</span>
            )}
          </div>
          <small>
            Red {entity.networkType} · {entity.active ? 'Activa' : 'Inactiva'} · Revisión{' '}
            {entity.revision}
          </small>
        </section>
      )}
      {!atmId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <h3>1. Identifica el nuevo ATM</h3>
          <p>
            Selecciona la entidad y usa el Terminal ID habilitado en el switch.
            {useTemplate
              ? ' El adquirente y la configuración se heredan de ATM20521.'
              : ' Introduce el adquirente aprobado para esta entidad.'}
          </p>
          {useTemplate && !template && (
            <p role="alert">
              No hay una plantilla ATM20521 activa de la entidad 205. Revisa el catálogo.
            </p>
          )}
          <fieldset disabled={busy || !!pendingRequest} className="form-grid">
            <label>
              Buscar entidad del ATM
              <input
                type="search"
                value={entitySearch}
                onChange={(event) => setEntitySearch(event.target.value)}
                placeholder="Código o nombre"
              />
            </label>
            <label>
              Entidad del nuevo ATM
              <select
                required
                value={selectedEntityId}
                onChange={(event) => {
                  setSelectedEntityId(event.target.value);
                  setAcquirerId('');
                  setRejected((previous) => ({ ...previous, acquirer: false }));
                  setError('');
                }}
              >
                <option value="">Selecciona una entidad</option>
                {entityOptions.map((item) => (
                  <option key={item.id} value={item.id} disabled={!item.active}>
                    {item.code} · {item.name} ·{' '}
                    {item.memberTypes?.map((type) => entityMemberLabels[type]).join(' / ') ||
                      'Sin clasificar'}
                    {!item.active ? ' · Inactiva' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Terminal ID autorizado
              <input
                autoFocus
                required
                maxLength={useTemplate ? 8 : catalogLimits.text}
                value={terminalId}
                aria-invalid={!!terminalId && (!terminalValid || duplicate)}
                aria-describedby="wizard-terminal-help"
                onChange={(event) => text(event.target.value, 'terminal')}
              />
              <small id="wizard-terminal-help">
                {duplicate
                  ? 'Este Terminal ID ya existe en Qa.'
                  : useTemplate
                    ? 'Ocho letras mayúsculas o dígitos; no se asigna un terminal en el switch.'
                    : 'Identificador aprobado para esta entidad; guardar no registra el terminal en el switch.'}
              </small>
            </label>
            <label>
              Alias ATM
              <input
                maxLength={catalogLimits.text}
                value={alias}
                placeholder={terminalId || 'Se usará el Terminal ID'}
                onChange={(event) => text(event.target.value, 'alias')}
              />
            </label>
            <label>
              {useTemplate ? 'Acquirer ID heredado' : 'Acquirer ID aprobado'}
              <input
                required
                maxLength={catalogLimits.text}
                readOnly={useTemplate}
                value={useTemplate ? (template?.acquirerId ?? '') : acquirerId}
                onChange={(event) => text(event.target.value, 'acquirer')}
              />
            </label>
          </fieldset>
          <p className="form-note">
            {useTemplate
              ? 'La configuración ISO/EMV y la seguridad se resuelven desde la plantilla; las reservas se comparten. No requiere reiniciar.'
              : 'El alta guarda la identidad administrativa. La prueba requiere configuración de saldo aprobada para esta entidad.'}
          </p>
          <div className="catalog-actions">
            <button type="button" disabled={busy} onClick={() => void refresh()}>
              Recargar catálogo
            </button>
            <button
              className="primary"
              disabled={
                busy ||
                rejected.alias ||
                rejected.terminal ||
                rejected.acquirer ||
                (!pendingRequest &&
                  (!entity?.active ||
                    (useTemplate ? !template : !acquirerId.trim()) ||
                    !terminalValid ||
                    duplicate))
              }
            >
              {busy ? 'Creando…' : pendingRequest ? 'Recuperar alta' : 'Crear y verificar'}
            </button>
          </div>
          {pendingRequest && !busy && (
            <p role="status">
              Conservamos la referencia del alta. Recuperar alta utiliza la misma solicitud y no
              crea otro ATM.
            </p>
          )}
        </form>
      )}
      {atmId && !atm && (
        <>
          <p role="alert">
            El ATM no está disponible en el catálogo actual. Recarga para comprobar su estado.
          </p>
          <button disabled={busy} onClick={() => void refresh()}>
            Recargar catálogo
          </button>
        </>
      )}
      {atm && !testing && (
        <>
          <h3>2. Verificación local de {atm.terminalId}</h3>
          <p>
            {atm.alias} · Revisión {atm.revision}. El perfil está guardado; la aceptación del host
            se comprueba con la prueba de saldo.
          </p>
          {inspecting && <p role="status">Verificando configuración, seguridad y reservas…</p>}
          {inspection && (
            <>
              <p className="form-note">
                Consultado: {new Date(inspection.checkedAt).toLocaleString('es-EC')}
              </p>
              <ul className="atm-inspection-checks">
                {inspection.checks.map((check) => (
                  <li key={check.id} data-status={check.status}>
                    <strong>{checkLabels[check.status]}</strong>
                    <span>{check.label}</span>
                    {check.action && <small>{check.action}</small>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="catalog-actions">
            <button disabled={busy || inspecting} onClick={() => void refresh()}>
              Actualizar verificación
            </button>
            <button disabled={busy || inspecting} onClick={props.onSettings}>
              Revisar configuración de envío
            </button>
            <button
              className="primary"
              disabled={!verified || busy}
              onClick={() => setTesting(true)}
            >
              Continuar a prueba de saldo
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="catalog-form-error" role="alert">
          {error}
        </p>
      )}
      {atm && testing && (
        <>
          <button disabled={testBusy} onClick={() => setTesting(false)}>
            Volver a verificación
          </button>
          <AtmBalanceTest
            atm={atm}
            entityId={entity?.id ?? ''}
            entityRevision={entity?.revision ?? 0}
            visible={visible}
            snapshot={props.snapshot}
            catalog={catalog}
            catalogError={undefined}
            loading={busy}
            disabled={!entityReady || !atm.active}
            client={client}
            onRefresh={props.onRefresh}
            onReviewingChange={testingChanged}
            onNavigate={() => undefined}
            onCatalogChange={props.onCatalogChange}
          />
        </>
      )}
    </section>
  );
}
