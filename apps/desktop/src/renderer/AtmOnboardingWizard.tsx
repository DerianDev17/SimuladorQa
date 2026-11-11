import { useCallback, useEffect, useRef, useState } from 'react';
import {
  catalogLimits,
  isRestrictedCatalogText,
  type AtmProfile,
  type CatalogSnapshot,
} from '../../../../packages/domain/src/catalogs';
import {
  parseCreateQaAtm,
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
  const [rejected, setRejected] = useState({ alias: false, terminal: false });
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
  const template = catalog?.atms.find(
    (item) =>
      item.environment === 'QA' &&
      item.terminalId === 'ATM20521' &&
      item.active &&
      catalog.entities.some(
        (entity) => entity.id === item.entityId && entity.code === '205' && entity.active,
      ),
  );
  const duplicate = duplicateAtmTerminal(catalog?.atms ?? [], terminalId, 'QA', null);
  const terminalValid = /^[A-Z0-9]{8}$/.test(terminalId.trim());
  const verified =
    inspection?.atmId === atm?.id &&
    inspection?.revision === atm?.revision &&
    inspection?.readyForBalanceTest &&
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
  }, [atm, client, visible, inspectionVersion, testing]);

  async function create() {
    if (lock.current || rejected.alias || rejected.terminal || (!template && !pendingRequest))
      return;
    const request =
      pendingRequest ??
      parseCreateQaAtm({
        environment: 'QA',
        requestId: crypto.randomUUID(),
        templateId: template!.id,
        templateRevision: template!.revision,
        alias: alias.trim() || terminalId.trim(),
        terminalId: terminalId.trim(),
      });
    if (!request) {
      setError('Completa un Terminal ID de ocho letras mayúsculas o dígitos y un alias válido.');
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
  function text(value: string, field: 'alias' | 'terminal') {
    const setter = field === 'alias' ? setAlias : setTerminalId;
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
    <section className="panel atm-onboarding" aria-label="Asistente ATM QA/205">
      <div className="panel-heading">
        <div>
          <h2>Crear y verificar ATM</h2>
          <p>Qa · Entidad 205 · Plantilla ATM20521</p>
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
      {!atmId && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <h3>1. Identifica el nuevo ATM</h3>
          <p>
            Usa el Terminal ID habilitado en el switch. La entidad y el adquirente se toman de
            ATM20521.
          </p>
          {!template && (
            <p role="alert">
              No hay una plantilla ATM20521 activa de la entidad 205. Revisa el catálogo.
            </p>
          )}
          <fieldset disabled={busy || !!pendingRequest} className="form-grid">
            <label>
              Terminal ID autorizado
              <input
                autoFocus
                required
                maxLength={8}
                value={terminalId}
                aria-invalid={!!terminalId && (!terminalValid || duplicate)}
                aria-describedby="wizard-terminal-help"
                onChange={(event) => text(event.target.value, 'terminal')}
              />
              <small id="wizard-terminal-help">
                {duplicate
                  ? 'Este Terminal ID ya existe en Qa.'
                  : 'Ocho letras mayúsculas o dígitos; no se asigna un terminal en el switch.'}
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
              Entidad
              <input
                readOnly
                value={
                  template
                    ? `205 · ${catalog?.entities.find((entity) => entity.id === template.entityId)?.name ?? ''}`
                    : 'No disponible'
                }
              />
            </label>
            <label>
              Acquirer ID heredado
              <input readOnly value={template?.acquirerId ?? ''} />
            </label>
          </fieldset>
          <p className="form-note">
            La configuración ISO/EMV y la seguridad se resuelven desde la plantilla; las reservas se
            comparten. No requiere reiniciar.
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
                (!pendingRequest && (!template || !terminalValid || duplicate))
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
        <AtmBalanceTest
          atm={atm}
          visible={visible}
          snapshot={props.snapshot}
          catalog={catalog}
          catalogError={undefined}
          loading={busy}
          disabled={false}
          client={client}
          onRefresh={props.onRefresh}
          onReviewingChange={testingChanged}
          onNavigate={() => undefined}
          onCatalogChange={props.onCatalogChange}
        />
      )}
    </section>
  );
}
