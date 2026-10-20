import { useState } from 'react';
import type { FormEvent } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import type { Environment } from '../../../../packages/domain/src/index';
import type {
  LoadTestDraft,
  LoadTestMode,
  LoadTestPlan,
} from '../../../../packages/domain/src/load-test';
import { LOAD_TEST_LOCAL_MAX_TPS } from '../../../../packages/domain/src/load-test';
import type { Result } from '../../../../packages/shared/src/contracts';

interface LoadTestViewProps {
  environment: Environment | undefined;
  atms: readonly AtmProfile[];
  disabled: boolean;
  onPrepare(request: LoadTestDraft): Promise<Result<LoadTestPlan>>;
}

interface DraftFields {
  mode: LoadTestMode;
  atmId: string;
  maxTransactions: string;
  targetTps: string;
  concurrency: string;
  rampUpSeconds: string;
  durationSeconds: string;
}

const initialFields: DraftFields = {
  mode: 'LOAD',
  atmId: '',
  maxTransactions: '',
  targetTps: '',
  concurrency: '',
  rampUpSeconds: '0',
  durationSeconds: '',
};

function positiveValue(value: string): number | undefined {
  if (!value.trim()) return;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function positiveInteger(value: string): number | undefined {
  const number = positiveValue(value);
  return number !== undefined && Number.isSafeInteger(number) ? number : undefined;
}

function nonNegativeInteger(value: string): number | undefined {
  if (!value.trim()) return;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : undefined;
}

export function LoadTestView({ environment, atms, disabled, onPrepare }: LoadTestViewProps) {
  const availableAtms = atms.filter((atm) => atm.active && atm.environment === 'QA');
  const [fields, setFields] = useState(initialFields);
  const [plan, setPlan] = useState<LoadTestPlan>();
  const [error, setError] = useState<string>();
  const [preparing, setPreparing] = useState(false);
  const selectedAtm = availableAtms.find((atm) => atm.id === fields.atmId);
  const count = positiveInteger(fields.maxTransactions);
  const targetTps = positiveValue(fields.targetTps);
  const concurrency = positiveInteger(fields.concurrency);
  const rampUpSeconds = nonNegativeInteger(fields.rampUpSeconds);
  const durationSeconds = positiveInteger(fields.durationSeconds);
  const isQa = environment === 'QA';
  const valid =
    isQa &&
    !!selectedAtm &&
    count !== undefined &&
    targetTps !== undefined &&
    targetTps <= LOAD_TEST_LOCAL_MAX_TPS &&
    concurrency !== undefined &&
    rampUpSeconds !== undefined &&
    (fields.mode === 'LOAD' || rampUpSeconds > 0) &&
    durationSeconds !== undefined;

  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setFields((current) => ({ ...current, [key]: value }));
    setPlan(undefined);
    setError(undefined);
  }

  async function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !valid ||
      !selectedAtm ||
      count === undefined ||
      targetTps === undefined ||
      concurrency === undefined ||
      rampUpSeconds === undefined ||
      durationSeconds === undefined
    )
      return;
    setPreparing(true);
    setPlan(undefined);
    setError(undefined);
    const result = await onPrepare({
      environment: 'QA',
      operation: 'BALANCE',
      atmId: selectedAtm.id,
      atmRevision: selectedAtm.revision,
      maxTransactions: count,
      targetTps,
      concurrency,
      mode: fields.mode,
      rampUpSeconds,
      durationSeconds,
    });
    if (result.ok) setPlan(result.value);
    else setError(result.error.message);
    setPreparing(false);
  }

  return (
    <div className="load-test-view">
      <header className="load-test-heading">
        <div>
          <h1>Carga y estrés</h1>
          <p>Prepara una corrida QA exclusivamente de consultas de saldo.</p>
        </div>
        <span className="pill amber">Solo planificación</span>
      </header>

      <div className="load-test-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>Parámetros propuestos</h2>
            <span className="pill">No persistidos</span>
          </div>
          <form className="load-test-form" onSubmit={(event) => void prepare(event)}>
            <label>
              Tipo de corrida
              <select
                value={fields.mode}
                onChange={(event) => update('mode', event.target.value as LoadTestMode)}
                disabled={disabled || preparing}
              >
                <option value="LOAD">Carga sostenida</option>
                <option value="STRESS">Estrés gradual</option>
              </select>
            </label>
            <label>
              Perfil ATM QA
              <select
                value={fields.atmId}
                onChange={(event) => update('atmId', event.target.value)}
                disabled={disabled || preparing || !isQa || !availableAtms.length}
              >
                <option value="">Selecciona un perfil</option>
                {availableAtms.map((atm) => (
                  <option key={atm.id} value={atm.id}>
                    {atm.alias} · {atm.terminalId}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Máximo de operaciones
              <input
                type="number"
                min="1"
                step="1"
                value={fields.maxTransactions}
                onChange={(event) => update('maxTransactions', event.target.value)}
                disabled={disabled || preparing}
                required
              />
            </label>
            <label>
              TPS objetivo
              <input
                type="number"
                min="0.001"
                max={LOAD_TEST_LOCAL_MAX_TPS}
                step="0.001"
                value={fields.targetTps}
                onChange={(event) => update('targetTps', event.target.value)}
                disabled={disabled || preparing}
                required
              />
              <small className="load-test-hint">
                Tope local solicitado: {LOAD_TEST_LOCAL_MAX_TPS} TPS. No representa una medición ni
                aprobación del Switch.
              </small>
            </label>
            <label>
              Concurrencia
              <input
                type="number"
                min="1"
                step="1"
                value={fields.concurrency}
                onChange={(event) => update('concurrency', event.target.value)}
                disabled={disabled || preparing}
                required
              />
            </label>
            <label>
              Aumento gradual (segundos)
              <input
                type="number"
                min={fields.mode === 'STRESS' ? '1' : '0'}
                step="1"
                value={fields.rampUpSeconds}
                onChange={(event) => update('rampUpSeconds', event.target.value)}
                disabled={disabled || preparing}
                required
              />
            </label>
            <label>
              Duración máxima (segundos)
              <input
                type="number"
                min="1"
                step="1"
                value={fields.durationSeconds}
                onChange={(event) => update('durationSeconds', event.target.value)}
                disabled={disabled || preparing}
                required
              />
            </label>

            {!isQa && (
              <p className="load-test-error" role="alert">
                La planificación y las corridas financieras solo están disponibles para QA.
              </p>
            )}
            {isQa && !availableAtms.length && (
              <p className="load-test-error" role="status">
                No hay perfiles ATM QA activos cargados.
              </p>
            )}
            {error && (
              <p className="load-test-error" role="alert">
                {error}
              </p>
            )}
            <div className="load-test-actions">
              <button type="submit" className="primary" disabled={disabled || preparing || !valid}>
                {preparing ? 'Preparando…' : 'Preparar borrador'}
              </button>
            </div>
          </form>
        </section>

        <aside className="load-test-side">
          <section className="panel">
            <div className="panel-heading">
              <h2>Estado de ejecución</h2>
              <span className="pill amber">Bloqueada</span>
            </div>
            <div className="preparation load-test-blocker">
              <strong>La ejecución real todavía está bloqueada</strong>
              <p>
                El servicio financiero actual procesa una operación a la vez y exige PIN y EMV
                nuevos por consulta. No hay un pool de tarjetas virtuales QA ni un motor que genere
                esas operaciones de forma segura.
              </p>
            </div>
            <p className="load-test-no-send">
              Preparar un borrador no abre conexiones financieras, no solicita PIN y no genera
              tramas. El tope de 5 TPS solo limita el borrador; faltan definir la ventana, la
              concurrencia y el máximo de operaciones de la prueba.
            </p>
          </section>

          {plan && (
            <section className="panel" aria-live="polite">
              <div className="panel-heading">
                <h2>Borrador preparado</h2>
                <span className="pill amber">Bloqueada</span>
              </div>
              <dl className="load-test-summary">
                <div>
                  <dt>Referencia del plan</dt>
                  <dd className="mono">{plan.planId}</dd>
                </div>
                <div>
                  <dt>Operación y ATM</dt>
                  <dd>Consulta de saldo · {selectedAtm?.alias ?? plan.draft.atmId}</dd>
                </div>
                <div>
                  <dt>Alcance propuesto</dt>
                  <dd>
                    {plan.draft.mode === 'LOAD' ? 'Carga sostenida' : 'Estrés gradual'}
                    {' · '}
                    {plan.draft.maxTransactions} operaciones · {plan.draft.targetTps} TPS ·{' '}
                    {plan.draft.concurrency} concurrentes · rampa {plan.draft.rampUpSeconds} s ·{' '}
                    {plan.draft.durationSeconds} s
                  </dd>
                </div>
              </dl>
              {plan.blockers.map((blocker) => (
                <p className="load-test-error" key={blocker.id}>
                  {blocker.label}
                </p>
              ))}
              <p className="load-test-no-send">
                Envíos: {plan.transmissionAttempted ? 'sí' : 'ninguno'} · Tramas:{' '}
                {plan.frameGenerated ? 'generadas' : 'ninguna'}
              </p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
