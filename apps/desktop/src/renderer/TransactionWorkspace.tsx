import { useCallback, useEffect, useRef, useState } from 'react';
import { scenarios, transactions } from '../../../../packages/domain/src/index';
import type { Scenario, TransactionType } from '../../../../packages/domain/src/index';
import { selectableAtms } from '../../../../packages/domain/src/catalogs';
import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import {
  accountTypes,
  draftBlockers,
  isDraftAmount,
  needsAmount,
  needsOriginal,
} from '../../../../packages/domain/src/transaction-draft';
import type { AccountType, DraftRequest } from '../../../../packages/domain/src/transaction-draft';
import { parseDraftRequest } from '../../../../packages/domain/src/transaction-draft';
import type {
  AppSnapshot,
  ErrorCode,
  ReviewedDraft,
} from '../../../../packages/shared/src/contracts';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';
import { localDraftChecks } from './draft-feedback';
import { DraftSummary } from './DraftSummary';
import { DestinationCompatibilityView } from './DestinationCompatibilityView';
import { CaptureEvidenceView } from './CaptureEvidenceView';
import { CaseLibrary } from './CaseLibrary';

interface Props {
  snapshot: AppSnapshot | undefined;
  catalog: CatalogSnapshot | undefined;
  catalogError: { code: ErrorCode; message: string } | undefined;
  loading: boolean;
  disabled: boolean;
  client: DesktopClient;
  onRefresh: () => Promise<void>;
  onReviewingChange: (reviewing: boolean) => void;
  onNavigate: (page: 'atms' | 'settings' | 'history') => void;
  onCatalogChange: (catalog: CatalogSnapshot) => void;
}
export function TransactionWorkspace({
  snapshot,
  catalog,
  catalogError,
  loading,
  disabled,
  client,
  onRefresh,
  onReviewingChange,
  onNavigate,
  onCatalogChange,
}: Props) {
  const [transaction, setTransaction] = useState<TransactionType>('BALANCE');
  const [scenario, setScenario] = useState<Scenario>('LOCAL');
  const [account, setAccount] = useState<AccountType>('SAVINGS');
  const [amount, setAmount] = useState('');
  const [atmId, setAtmId] = useState('');
  const [review, setReview] = useState<ReviewedDraft>();
  const [error, setError] = useState<{ code: string; message: string }>();
  const [reviewing, setReviewing] = useState(false);
  const [casesOpen, setCasesOpen] = useState(false);
  const [caseWarning, setCaseWarning] = useState<string>();
  const onCasesOpenChange = useCallback(
    (open: boolean) => {
      setCasesOpen(open);
      onReviewingChange(open);
    },
    [onReviewingChange],
  );
  const generation = useRef(0);
  const active = useRef(true);
  const amountInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      generation.current++;
      onReviewingChange(false);
    };
  }, [onReviewingChange]);
  useEffect(() => {
    generation.current++;
    setReview(undefined);
    setError(undefined);
    if (!catalog || !selectableAtms(catalog).some((atm) => atm.id === atmId)) setAtmId('');
  }, [catalog, atmId]);

  const atms =
    catalog && catalog.environment === snapshot?.environment ? selectableAtms(catalog) : [];
  const selectedAtm = atms.find((atm) => atm.id === atmId);
  const original = needsOriginal(transaction);
  const monetary = needsAmount(transaction);
  const operation = original
    ? undefined
    : snapshot?.documentedOperations.find(
        (item) => item.transaction === transaction && item.account === account,
      );
  const fieldsDisabled = disabled || reviewing || casesOpen;
  const draft: DraftRequest | undefined = snapshot
    ? {
        environment: snapshot.environment,
        transaction,
        scenario,
        atmId: selectedAtm?.id ?? null,
        atmRevision: selectedAtm?.revision ?? null,
        account: original ? null : account,
        amount: monetary ? amount : null,
      }
    : undefined;
  const blockers = review?.blockers ?? draftBlockers(transaction, !!operation);
  const amountInvalid = monetary && amount.length > 0 && !isDraftAmount(amount);
  const checks = localDraftChecks({
    transaction,
    amount,
    environmentVerified: !!snapshot,
    atmSelected: !!selectedAtm,
    catalogAvailable: !!catalog && !loading && !catalogError,
    operationAvailable: !!operation,
    original,
  });

  function reset() {
    invalidate();
    setCaseWarning(undefined);
    setTransaction('BALANCE');
    setScenario('LOCAL');
    setAccount('SAVINGS');
    setAmount('');
    setAtmId('');
  }

  function invalidate() {
    generation.current++;
    setReview(undefined);
    setError(undefined);
    setCaseWarning(undefined);
  }
  function loadCase(saved: DraftRequest, warning: string | undefined) {
    invalidate();
    setTransaction(saved.transaction);
    setScenario(saved.scenario);
    setAccount(saved.account ?? 'SAVINGS');
    setAmount(saved.amount ?? '');
    setAtmId(saved.atmId ?? '');
    setCaseWarning(warning);
  }
  async function prepare() {
    invalidate();
    if (!snapshot || !catalog || loading) return;
    if (monetary && !isDraftAmount(amount)) {
      amountInput.current?.focus();
      setError({
        code: 'VALIDATION_ERROR',
        message: 'Escribe el monto con punto y dos decimales, por ejemplo 100.50.',
      });
      return;
    }
    const revision = generation.current;
    setReviewing(true);
    onReviewingChange(true);
    const result = await client.call((api) =>
      api.reviewDraft({
        environment: snapshot.environment,
        transaction,
        scenario,
        atmId: selectedAtm?.id ?? null,
        atmRevision: selectedAtm?.revision ?? null,
        account: original ? null : account,
        amount: monetary ? amount : null,
      }),
    );
    if (!active.current) return;
    if (revision === generation.current) {
      if (result.ok) setReview(result.value);
      else setError(result.error);
    }
    setReviewing(false);
    onReviewingChange(false);
  }

  return (
    <div className="transaction-workspace">
      <div className="transaction-heading">
        <div>
          <h1>Nueva transacción</h1>
          <p>Prepara el cajero y verifica el recorrido por Switch y Core.</p>
        </div>
        <div className="transaction-toolbar">
          <label>
            <span className="visually-hidden">Plantilla documental</span>
            <select
              aria-label="Plantilla documental"
              value=""
              disabled={fieldsDisabled || !snapshot?.documentedOperations.length}
              onChange={(event) => {
                const selected = snapshot?.documentedOperations.find(
                  (item) => `${item.transaction}:${item.account}` === event.target.value,
                );
                if (!selected) return;
                invalidate();
                setTransaction(selected.transaction);
                setAccount(selected.account);
                setAmount('');
              }}
            >
              <option value="">Plantillas documentales</option>
              {snapshot?.documentedOperations.map((item) => (
                <option
                  key={`${item.transaction}:${item.account}`}
                  value={`${item.transaction}:${item.account}`}
                >
                  {transactions.find((entry) => entry.id === item.transaction)?.label} ·{' '}
                  {accountTypes.find((entry) => entry.id === item.account)?.label} · {item.code}
                </option>
              ))}
            </select>
          </label>
          <CaseLibrary
            draft={draft}
            catalog={catalog}
            client={client}
            disabled={fieldsDisabled || loading || !!catalogError}
            canSave={!!selectedAtm && !!parseDraftRequest(draft)}
            onCatalogChange={onCatalogChange}
            onLoad={loadCase}
            onOpenChange={onCasesOpenChange}
          />
          <button disabled={fieldsDisabled} onClick={reset}>
            Limpiar borrador
          </button>
        </div>
      </div>
      {caseWarning && (
        <div className="document-note" role="status">
          {caseWarning}
        </div>
      )}
      <ol className="transaction-steps" aria-label="Pasos de la transacción">
        {[
          ['Datos Generales', 'Cajero, cuenta y operación'],
          ['Ejecutar', 'Envío y respuesta'],
          ['Resultado', 'Validación y recorridos'],
          ['Historial', 'Detalles y evidencias'],
        ].map(([title, subtitle], index) => (
          <li key={title} aria-current={index === 0 ? 'step' : undefined}>
            <span className="transaction-step-number">{index + 1}</span>
            <div>
              <strong>{title}</strong>
              <small>{subtitle}</small>
            </div>
          </li>
        ))}
      </ol>

      <div className="transaction-columns">
        <section className="panel transaction-context" aria-labelledby="transaction-context-title">
          <div className="panel-heading">
            <h2 id="transaction-context-title">Datos de la transacción</h2>
            <span className={`pill ${snapshot?.environment === 'PREPROD' ? 'amber' : 'blue'}`}>
              {snapshot?.environment ?? 'Sin verificar'}
            </span>
          </div>
          <div className="transaction-fields">
            <div className="transaction-context-selectors">
              <label>
                Perfil ATM
                <select
                  aria-label="Perfil ATM"
                  value={selectedAtm?.id ?? ''}
                  disabled={fieldsDisabled || loading || !atms.length}
                  onChange={(event) => {
                    invalidate();
                    setAtmId(event.target.value);
                  }}
                >
                  <option value="">
                    {loading
                      ? 'Cargando perfiles…'
                      : atms.length
                        ? 'Selecciona un ATM'
                        : 'Sin ATM activos en este ambiente'}
                  </option>
                  {atms.map((atm) => (
                    <option key={atm.id} value={atm.id}>
                      {atm.alias} · Borrador
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Escenario
                <select
                  aria-label="Escenario"
                  value={scenario}
                  disabled={fieldsDisabled}
                  onChange={(event) => {
                    const selected = scenarios.find((item) => item.id === event.target.value);
                    if (selected) {
                      invalidate();
                      setScenario(selected.id);
                    }
                  }}
                >
                  {scenarios.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="draft-profile-status">
              <span className="pill amber">
                {selectedAtm ? 'Perfil en borrador' : 'ATM sin seleccionar'}
              </span>
              <button
                className="text-button"
                disabled={loading || fieldsDisabled || !snapshot}
                onClick={() => {
                  invalidate();
                  void onRefresh();
                }}
              >
                Recargar perfiles
              </button>
              {!atms.length && !loading && (
                <button
                  className="text-button"
                  disabled={fieldsDisabled}
                  onClick={() => onNavigate('atms')}
                >
                  Configurar ATM
                </button>
              )}
            </div>
            {selectedAtm && (
              <p className="form-note">
                {catalog?.entities.find((item) => item.id === selectedAtm.entityId)?.name} ·
                Terminal {selectedAtm.terminalId}. Requiere validación QA.
              </p>
            )}
            {catalogError && (
              <div className="inline-error" role="alert">
                <strong>{catalogError.message}</strong>
                <small>{catalogError.code}</small>
              </div>
            )}

            <fieldset className="card-source-picker">
              <legend>Tarjeta de prueba</legend>
              <div>
                <button disabled>
                  <Icon name="reader" size={16} /> Lector físico
                </button>
                <button disabled>
                  <Icon name="card" size={16} /> Tarjeta configurada
                </button>
              </div>
              <div className="card-preview" aria-label="Estado de tarjeta">
                <span className="card-preview-icon">
                  <Icon name="card" size={32} />
                </span>
                <div>
                  <strong>Sin tarjeta seleccionada</strong>
                  <p>Sin tarjeta validada · lector sin verificar</p>
                  <span>Entidad — · Producto —</span>
                </div>
              </div>
            </fieldset>
            <label>
              Transacción
              <select
                aria-label="Transacción"
                value={transaction}
                disabled={fieldsDisabled}
                onChange={(event) => {
                  const selected = transactions.find((item) => item.id === event.target.value);
                  if (selected) {
                    invalidate();
                    setTransaction(selected.id);
                    setAmount('');
                  }
                }}
              >
                {transactions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cuenta
              <select
                aria-label="Cuenta"
                value={original ? '' : account}
                disabled={fieldsDisabled || original}
                onChange={(event) => {
                  const selected = accountTypes.find((item) => item.id === event.target.value);
                  if (selected) {
                    invalidate();
                    setAccount(selected.id);
                  }
                }}
              >
                {original ? (
                  <option value="">Pendiente de transacción original</option>
                ) : (
                  accountTypes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            {monetary && (
              <label>
                Monto de prueba
                <input
                  ref={amountInput}
                  aria-label="Monto de prueba"
                  aria-invalid={amountInvalid}
                  aria-describedby="draft-amount-help"
                  inputMode="decimal"
                  value={amount}
                  maxLength={14}
                  placeholder="100.50"
                  disabled={fieldsDisabled}
                  onChange={(event) => {
                    invalidate();
                    setAmount(event.target.value);
                  }}
                />
                <small
                  id="draft-amount-help"
                  className={amountInvalid ? 'field-feedback invalid' : 'field-feedback'}
                  aria-live="polite"
                >
                  {amountInvalid
                    ? 'Usa punto y dos decimales, por ejemplo 100.50. No se modifica tu entrada.'
                    : 'Punto y dos decimales. Límites y moneda de ejecución pendientes.'}
                </small>
              </label>
            )}
            <p className="form-note">
              {scenarios.find((item) => item.id === scenario)?.description}
            </p>
          </div>
          <div className="transaction-send-actions">
            <button
              className="primary"
              disabled={fieldsDisabled || loading || !snapshot || !catalog || !!catalogError}
              onClick={() => void prepare()}
            >
              {reviewing ? 'Revisando…' : 'Revisar requisitos'}
              <Icon name="arrow" size={16} />
            </button>
            <button disabled aria-describedby="send-blocked-note">
              Enviar transacción
            </button>
          </div>
          <p id="send-blocked-note" className="form-note">
            Envío bloqueado: faltan perfiles validados, diccionario ATM y evidencia QA.
          </p>
          {error && (
            <div className="inline-error" role="alert">
              <strong>{error.message}</strong>
              <details>
                <summary>Detalle técnico</summary>
                <code>{error.code}</code>
              </details>
            </div>
          )}
          {review && (
            <div className="preparation" role="status">
              <strong>Envío bloqueado · {review.environment}</strong>
              <p>
                Faltan {review.blockers.length} grupos de requisitos. No se ha enviado ninguna
                trama.
              </p>
              <span className="source">Especificación: {review.specification}</span>
            </div>
          )}
        </section>

        <section className="panel transaction-flow" aria-labelledby="transaction-flow-title">
          <div className="panel-heading">
            <h2 id="transaction-flow-title">Flujo de transacción</h2>
            <span className="pill neutral">Sin ejecución</span>
          </div>
          <ol className="transaction-route">
            {[
              {
                icon: 'atm' as const,
                title: 'ATM Simulator',
                text: selectedAtm ? 'Perfil en borrador, sin envío' : 'Selecciona un perfil ATM',
              },
              {
                icon: 'monitor' as const,
                title: 'Switch Coonecta (SmartVista)',
                text: 'Conexión sin configurar',
              },
              { icon: 'database' as const, title: 'Core', text: 'Observador sin configurar' },
              {
                icon: 'transaction' as const,
                title: 'Respuesta del Switch',
                text: 'Sin mensaje recibido',
              },
            ].map((step) => (
              <li key={step.title}>
                <span className="route-icon">
                  <Icon name={step.icon} size={21} />
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.text}</small>
                </div>
                <span className="route-time">—</span>
              </li>
            ))}
          </ol>
          <div className="transaction-result-placeholder">
            <Icon name="clock" size={23} />
            <div>
              <strong>Resultado pendiente</strong>
              <p>
                La revisión prepara el contexto; el resultado aparecerá al ejecutar un flujo
                habilitado.
              </p>
            </div>
          </div>
          <dl className="transaction-result-values">
            <div>
              <dt>Código de respuesta</dt>
              <dd>—</dd>
            </div>
            <div>
              <dt>Monto ejecutado</dt>
              <dd>—</dd>
            </div>
          </dl>
        </section>

        <section
          className="panel transaction-inspector"
          aria-labelledby="transaction-inspector-title"
        >
          <div className="panel-heading">
            <h2 id="transaction-inspector-title">Mensaje ISO8583</h2>
            <label className="inspector-view-picker">
              <span className="visually-hidden">Vista del mensaje</span>
              <select aria-label="Vista del mensaje" disabled>
                <option>Vista: Campos</option>
              </select>
            </label>
          </div>
          <div className="inspector-tabs" role="tablist" aria-label="Vistas de evidencia">
            <button role="tab" aria-selected="false" disabled>
              Solicitud
            </button>
            <button role="tab" aria-selected="false" disabled>
              Respuesta
            </button>
            <button role="tab" aria-selected="false" disabled>
              RAW
            </button>
            <button role="tab" aria-selected="false" disabled>
              HEX
            </button>
          </div>
          <table className="inspector-table" aria-label="Campos del mensaje">
            <thead>
              <tr>
                <th>Campo</th>
                <th>Descripción</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3}>
                  <div className="empty-state compact">
                    <Icon name="transaction" size={32} />
                    <h3>Esperando una ejecución</h3>
                    <p>
                      Los campos y mensajes sanitizados estarán disponibles con el diccionario ATM y
                      las tramas validadas.
                    </p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="inspector-footnote">
            <Icon name="shield" size={14} /> Sin mensaje · datos sensibles protegidos
          </p>
        </section>
      </div>
      <div className="transaction-bottom-grid">
        <section className="panel" aria-labelledby="transaction-recent-title">
          <div className="panel-heading">
            <h2 id="transaction-recent-title">Últimas transacciones</h2>
            <button className="text-button" onClick={() => onNavigate('history')}>
              Ver todas <Icon name="arrow" size={14} />
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>ATM</th>
                <th>Transacción</th>
                <th>PAN</th>
                <th>Monto</th>
                <th>RC</th>
                <th>Tiempo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={8} className="transaction-empty-row">
                  Aún no hay ejecuciones. Las revisiones de borrador no generan transacciones.
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className="panel" aria-labelledby="transaction-metrics-title">
          <div className="panel-heading">
            <h2 id="transaction-metrics-title">Métricas de ejecución</h2>
            <span className="pill neutral">Sin actividad</span>
          </div>
          <dl className="transaction-metrics">
            <div className="metric-tps">
              <dt>TPS actual</dt>
              <dd>
                — <Icon name="load" size={28} />
              </dd>
            </div>
            <div className="metric-total">
              <dt>Transacciones totales</dt>
              <dd>
                0 <Icon name="transaction" size={25} />
              </dd>
            </div>
          </dl>
          <dl className="transaction-outcomes">
            {[
              { label: 'Aprobadas', tone: 'approved' },
              { label: 'Rechazadas', tone: 'declined' },
              { label: 'Timeouts', tone: 'timeout' },
            ].map((item) => (
              <div className={item.tone} key={item.label}>
                <dt>{item.label}</dt>
                <dd>
                  0<span className="outcome-ring" aria-hidden="true" />
                </dd>
                <small>Sin ejecuciones</small>
              </div>
            ))}
          </dl>
          <p className="metrics-footnote">Sin ventana de medición activa.</p>
        </section>
      </div>
      <div className="transaction-support-grid">
        <section
          className="panel transaction-preparation-panel"
          aria-label="Preparación y requisitos"
        >
          <div className="panel-heading">
            <h2>Preparación y requisitos</h2>
            <span className="pill amber">Envío bloqueado</span>
          </div>
          <div className="transaction-readiness">
            {review && <DraftSummary review={review} />}
            {review?.destinationCompatibility && (
              <DestinationCompatibilityView report={review.destinationCompatibility} />
            )}
            <div className="local-draft-checks" aria-label="Preparación local">
              <h3>
                Preparación local{' '}
                <span>
                  {checks.filter((check) => check.complete).length}/{checks.length}
                </span>
              </h3>
              <ul>
                {checks.map((check) => (
                  <li key={check.key}>
                    <span
                      className={check.complete ? 'local-check complete' : 'local-check'}
                      aria-label={check.complete ? 'Completado' : 'Pendiente'}
                    >
                      {check.complete ? '✓' : '○'}
                    </span>
                    <div>
                      <strong>{check.label}</strong>
                      <p>{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <small>
                Completar estos datos prepara el borrador; el envío requiere la evidencia pendiente.
              </small>
            </div>
            <div className="send-requirements">
              <h3>Requisitos de envío</h3>
              <ul>
                {blockers.map((blocker) => (
                  <li key={blocker.id}>
                    <span className="status-dot amber" />
                    <div>
                      <strong>{blocker.label}</strong>
                      <p>{blocker.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button className="text-button" onClick={() => onNavigate('settings')}>
                Ver configuración pendiente <Icon name="arrow" size={14} />
              </button>
            </div>
          </div>
        </section>
        <section
          className="panel transaction-reference-panel"
          aria-label="Documentación de la operación"
        >
          {' '}
          <div className="documented-operation" aria-label="Referencia documental">
            <span className="eyebrow">REFERENCIA DOCUMENTAL</span>
            <h3>{original ? 'Reverso asociado al original' : 'Catálogo de la operación'}</h3>
            {operation ? (
              <>
                <dl>
                  <div>
                    <dt>TrnCode CMS</dt>
                    <dd className="documented-code">{operation.code}</dd>
                  </div>
                  <div>
                    <dt>Tipo de cuenta CMS</dt>
                    <dd>
                      {operation.accountCode} ·{' '}
                      {accountTypes.find((item) => item.id === operation.account)?.label}
                    </dd>
                  </div>
                </dl>
                <p>
                  {operation.source.title} v{operation.source.version} · p. {operation.source.page};
                  cuenta p. 17.
                </p>
                <small>
                  Referencia CMS. El formato del mensaje ATM sigue pendiente de validación.
                </small>
              </>
            ) : (
              <p>
                {original
                  ? 'Requiere el mensaje original, la familia MTI y los campos de correlación aprobados.'
                  : 'El catálogo documental no está disponible para esta selección.'}
              </p>
            )}
          </div>
          {original && (
            <div className="document-note">
              <Icon name="shield" size={19} />
              <p>
                {transaction === 'TIMEOUT_REVERSAL'
                  ? 'Timeout, duplicados y respuesta tardía: reglas operativas pendientes.'
                  : 'El código y la cuenta se resolverán desde la transacción original validada.'}
              </p>
            </div>
          )}
        </section>
        {snapshot?.captureEvidence && (
          <section className="panel transaction-captures-panel">
            <CaptureEvidenceView report={snapshot.captureEvidence} />
          </section>
        )}
      </div>
    </div>
  );
}
