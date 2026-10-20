import { useEffect, useState } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import type { Environment } from '../../../../packages/domain/src/index';
import type { LoadTestDraft, LoadTestMode } from '../../../../packages/domain/src/load-test';
import {
  LOAD_RUN_MAX_OPERATIONS,
  LOAD_RUN_MAX_SECONDS,
  loadRunMetrics,
  parseLoadRunRequest,
} from '../../../../packages/domain/src/load-run';
import type { LoadRunSnapshot, LoadRunTimings } from '../../../../packages/domain/src/load-run';
import { DesktopClient } from './desktop-client';
import { CardReaderView } from './CardReaderView';
import type { TransactionCard } from './transaction-card';
import { Icon } from './Icon';

interface Props {
  environment: Environment | undefined;
  atms: readonly AtmProfile[];
  disabled: boolean;
  onBusyChange(busy: boolean): void;
}
type Preset = 'QUICK' | 'ONE' | 'THREE' | 'FIVE' | 'CUSTOM';
const presets = [
  {
    id: 'QUICK',
    title: 'Prueba rápida',
    detail: '30 segundos · 1 TPS',
    tps: 1,
    seconds: 30,
    count: 30,
  },
  {
    id: 'ONE',
    title: '1 TPS',
    detail: '60 segundos · carga básica',
    tps: 1,
    seconds: 60,
    count: 60,
  },
  {
    id: 'THREE',
    title: '3 TPS',
    detail: '60 segundos · carga moderada',
    tps: 3,
    seconds: 60,
    count: 100,
  },
  {
    id: 'FIVE',
    title: '5 TPS',
    detail: '60 segundos · carga alta',
    tps: 5,
    seconds: 60,
    count: 100,
  },
] as const;
const labels = {
  RUNNING: 'En ejecución',
  STOPPING: 'Deteniendo',
  COMPLETED: 'Completada',
  STOPPED: 'Detenida',
  FAILED: 'Detenida por error',
  INTERRUPTED: 'Interrumpida',
};
const stages: { key: keyof LoadRunTimings; label: string }[] = [
  { key: 'cardReadMs', label: 'Lectura del chip' },
  { key: 'inspectMs', label: 'Validación de perfil' },
  { key: 'contextMs', label: 'PIN, EMV y contexto' },
  { key: 'validationMs', label: 'Revalidación' },
  { key: 'journalMs', label: 'Diario local' },
  { key: 'transportMs', label: 'Transporte y respuesta' },
  { key: 'otherMs', label: 'Otras etapas' },
];
const ms = (value: number | null | undefined) =>
  value == null ? '—' : Math.round(value).toLocaleString() + ' ms';

function TpsChart({ run }: { run: LoadRunSnapshot }) {
  const events = run.items
    .filter((item) => item.sent && item.finishedAt)
    .map((item) => Date.parse(item.finishedAt!) - Date.parse(run.startedAt))
    .filter((value) => Number.isFinite(value) && value >= 0);
  if (!events.length)
    return (
      <p className="load-empty-chart">
        La serie por segundo estará disponible en la próxima corrida.
      </p>
    );
  const horizon = Math.max(
    run.state === 'RUNNING' ? run.draft.durationSeconds * 1000 : run.elapsedMs,
    1000,
  );
  const ceiling = Math.max(5, run.draft.targetTps);
  const points = Array.from({ length: 41 }, (_, index) => {
    const at = (horizon * index) / 40;
    const from = Math.max(0, at - 10000);
    const span = Math.max(1000, at - from);
    const rate = (events.filter((time) => time > from && time <= at).length * 1000) / span;
    return (
      Math.round(index * 12.5) + ',' + Math.round(112 - (Math.min(rate, ceiling) * 112) / ceiling)
    );
  });
  const targetY = Math.round(112 - (run.draft.targetTps * 112) / ceiling);
  return (
    <div className="load-chart">
      <svg viewBox="0 0 500 112" role="img" aria-label="Respuestas por segundo durante la corrida">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <line
            key={index}
            x1="0"
            x2="500"
            y1={index * 22.4}
            y2={index * 22.4}
            className="load-gridline"
          />
        ))}
        <line x1="0" x2="500" y1={targetY} y2={targetY} className="load-target-line" />
        <polyline points={points.join(' ')} className="load-actual-line" />
      </svg>
      <div className="load-chart-caption">
        <span>Inicio</span>
        <span>{Math.round(horizon / 1000)} s</span>
      </div>
    </div>
  );
}

export function LoadTestView({ environment, atms, disabled, onBusyChange }: Props) {
  const available = atms.filter((atm) => atm.active && atm.environment === 'QA');
  const [atmIds, setAtmIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<Preset>('QUICK');
  const [advanced, setAdvanced] = useState(false);
  const [mode, setMode] = useState<LoadTestMode>('LOAD');
  const [count, setCount] = useState('30');
  const [tps, setTps] = useState('1');
  const [duration, setDuration] = useState('30');
  const [ramp, setRamp] = useState('10');
  const [card, setCard] = useState<TransactionCard>();
  const [run, setRun] = useState<LoadRunSnapshot | null>(null);
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [statusReady, setStatusReady] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const active = !!run && ['RUNNING', 'STOPPING'].includes(run.state);
  const locked = active || starting || uncertain;
  const client = new DesktopClient(window.desktop);
  const selected = available.find((atm) => atm.id === atmIds[0]);
  const draft: LoadTestDraft = {
    environment: 'QA',
    operation: 'BALANCE',
    mode,
    atmId: atmIds.length === 1 ? atmIds[0]! : '',
    atmRevision: atmIds.length === 1 ? (selected?.revision ?? 0) : 0,
    maxTransactions: Number(count),
    targetTps: Number(tps),
    concurrency: 1,
    rampUpSeconds: mode === 'STRESS' ? Number(ramp) : 0,
    durationSeconds: Number(duration),
  };
  useEffect(() => {
    if (!atmIds.length && available.length === 1) setAtmIds([available[0]!.id]);
  }, [atms, atmIds.length]);
  useEffect(() => {
    onBusyChange(locked);
    return () => onBusyChange(false);
  }, [locked, onBusyChange]);
  useEffect(() => {
    let live = true;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const result = await client.call((api) => api.getLoadRun());
      pending = false;
      if (!live) return;
      setStatusReady(result.ok);
      if (result.ok) setRun(result.value);
      else setError(result.error.message);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  const valid =
    !!card &&
    !!selected &&
    atmIds.length === 1 &&
    !!parseLoadRunRequest({
      requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      cardReadId: card.readId,
      draft,
    });
  const issues = [
    ...(environment !== 'QA' ? ['Selecciona el ambiente QA.'] : []),
    ...(!atmIds.length ? ['Selecciona un ATM QA.'] : []),
    ...(atmIds.length > 1
      ? [
          'La ejecución simultánea de varios ATM requiere un proveedor financiero QA independiente por terminal. Selecciona un ATM para esta corrida.',
        ]
      : []),
    ...(!card ? ['Lee y selecciona la tarjeta física QA.'] : []),
    ...(Number(count) < 1 ||
    Number(count) > LOAD_RUN_MAX_OPERATIONS ||
    !Number.isSafeInteger(Number(count))
      ? ['La cantidad debe estar entre 1 y ' + LOAD_RUN_MAX_OPERATIONS + '.']
      : []),
    ...(Number(tps) <= 0 || Number(tps) > 5 ? ['El objetivo debe estar entre 0,1 y 5 TPS.'] : []),
    ...(Number(duration) < 1 ||
    Number(duration) > LOAD_RUN_MAX_SECONDS ||
    !Number.isSafeInteger(Number(duration))
      ? ['La duración debe estar entre 1 y ' + LOAD_RUN_MAX_SECONDS + ' segundos.']
      : []),
    ...(mode === 'STRESS' &&
    (!Number.isSafeInteger(Number(ramp)) || Number(ramp) < 1 || Number(ramp) >= Number(duration))
      ? ['El aumento gradual debe durar menos que la prueba.']
      : []),
  ];
  function choosePreset(id: Exclude<Preset, 'CUSTOM'>) {
    const choice = presets.find((item) => item.id === id)!;
    setPreset(id);
    setMode('LOAD');
    setCount(String(choice.count));
    setTps(String(choice.tps));
    setDuration(String(choice.seconds));
  }
  async function start() {
    if (!valid || !card || locked) return;
    setStarting(true);
    setError(undefined);
    const result = await client.call(
      (api) => api.startLoadRun({ requestId: crypto.randomUUID(), cardReadId: card.readId, draft }),
      20000,
    );
    if (result.ok) {
      setRun(result.value);
      setCard(undefined);
    } else {
      setError(result.error.message);
      if (result.error.code === 'TIMEOUT') setUncertain(true);
    }
    setStarting(false);
  }
  async function stop() {
    if (!run) return;
    const result = await client.call((api) => api.stopLoadRun({ runId: run.runId }));
    if (result.ok) {
      setRun(result.value);
      setUncertain(false);
    } else setError(result.error.message);
  }
  const metrics = run ? loadRunMetrics(run) : null;
  const progress = run
    ? Math.min(
        100,
        Math.max(
          (run.items.length / run.draft.maxTransactions) * 100,
          (run.elapsedMs / (run.draft.durationSeconds * 1000)) * 100,
        ),
      )
    : 0;
  const timed = run?.items.filter((item) => item.timings) ?? [];
  const totals = stages.map(({ key, label }) => ({
    key,
    label,
    value: timed.reduce((sum, item) => sum + (item.timings?.[key] ?? 0), 0),
  }));
  const maxTiming = Math.max(1, ...totals.map((item) => item.value));
  return (
    <div className="load-test-view">
      <header className="load-test-heading">
        <div>
          <h1>Carga y estrés</h1>
          <p>Pruebas QA de saldo con resultados medidos en cada etapa.</p>
        </div>
        <div className="load-assistant">
          <Icon name="load" size={24} />
          <span>
            <strong>Asistente de pruebas</strong>
            <small>Selecciona ATM, escenario y tarjeta; el sistema valida al iniciar.</small>
          </span>
        </div>
      </header>
      <div className="load-test-columns">
        <section className="panel load-setup" aria-label="Configurar prueba">
          <div className="load-mode-tabs">
            <button
              className={!advanced ? 'selected' : ''}
              aria-pressed={!advanced}
              onClick={() => setAdvanced(false)}
            >
              <Icon name="load" size={19} />
              <span>
                <strong>Modo básico</strong>
                <small>Escenarios preconfigurados</small>
              </span>
            </button>
            <button
              className={advanced ? 'selected' : ''}
              aria-pressed={advanced}
              onClick={() => setAdvanced(true)}
            >
              <Icon name="settings" size={19} />
              <span>
                <strong>Modo avanzado</strong>
                <small>Parámetros personalizados</small>
              </span>
            </button>
          </div>
          <div className="load-step">
            <div className="load-step-title">
              <h2>1. Selecciona los ATM</h2>
              <span>QA</span>
            </div>
            <details className="load-atm-picker">
              <summary>
                {atmIds.length
                  ? atmIds
                      .map((id) => available.find((atm) => atm.id === id)?.terminalId ?? id)
                      .join(' · ')
                  : 'Selecciona un ATM QA'}
              </summary>
              <div className="load-atm-options">
                {available.map((atm) => (
                  <label key={atm.id}>
                    <input
                      type="checkbox"
                      checked={atmIds.includes(atm.id)}
                      disabled={locked || disabled}
                      onChange={(event) =>
                        setAtmIds((ids) =>
                          event.target.checked
                            ? [...ids, atm.id]
                            : ids.filter((id) => id !== atm.id),
                        )
                      }
                    />
                    {atm.alias} · {atm.terminalId}
                  </label>
                ))}
              </div>
            </details>
            {atmIds.length > 1 && (
              <p className="load-inline-note">
                Varios ATM se pueden seleccionar para planificar; la ejecución financiera disponible
                es de un ATM por corrida.
              </p>
            )}
          </div>
          <div className="load-step">
            <div className="load-step-title">
              <h2>2. Escenario de prueba</h2>
            </div>
            <div className="load-preset-grid">
              {presets.map((item) => (
                <button
                  key={item.id}
                  className={preset === item.id ? 'selected' : ''}
                  aria-pressed={preset === item.id}
                  disabled={locked || disabled}
                  onClick={() => choosePreset(item.id)}
                >
                  <Icon name={item.id === 'QUICK' ? 'arrow' : 'load'} size={22} />
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="load-step">
            <div className="load-step-title">
              <h2>3. Tarjeta de prueba</h2>
            </div>
            {!active && !starting ? (
              <CardReaderView
                environment="QA"
                transaction
                disabled={disabled || uncertain}
                selectedReadId={card?.readId}
                onUseCard={setCard}
                onClearCard={() => setCard(undefined)}
              />
            ) : (
              <p className="load-inline-note">
                Mantén insertada la tarjeta seleccionada hasta que termine la corrida.
              </p>
            )}
            <p className="load-inline-note">
              Los perfiles guardados ayudan a elegir el AID, pero la prueba requiere el chip físico.
              PIN una vez por corrida y seguridad EMV nueva por consulta.
            </p>
          </div>
          <div className="load-fixed-operation">
            <strong>Transacción: consulta de saldo (702)</strong>
            <small>
              QA · ahorros · tarjeta presente. Otros flujos requieren contrato validado.
            </small>
          </div>
          {advanced && (
            <div className="load-advanced">
              <h3>Parámetros avanzados</h3>
              <div className="load-test-form">
                <label>
                  Máximo de operaciones
                  <input
                    type="number"
                    min="1"
                    max={LOAD_RUN_MAX_OPERATIONS}
                    value={count}
                    disabled={locked || disabled}
                    onChange={(event) => {
                      setCount(event.target.value);
                      setPreset('CUSTOM');
                    }}
                  />
                </label>
                <label>
                  TPS objetivo
                  <input
                    type="number"
                    min="0.1"
                    max="5"
                    step="0.1"
                    value={tps}
                    disabled={locked || disabled}
                    onChange={(event) => {
                      setTps(event.target.value);
                      setPreset('CUSTOM');
                    }}
                  />
                </label>
                <label>
                  Duración máxima (segundos)
                  <input
                    type="number"
                    min="1"
                    max={LOAD_RUN_MAX_SECONDS}
                    value={duration}
                    disabled={locked || disabled}
                    onChange={(event) => {
                      setDuration(event.target.value);
                      setPreset('CUSTOM');
                    }}
                  />
                </label>
                <label>
                  Concurrencia
                  <input value="1 · una tarjeta física" readOnly />
                </label>
                <label>
                  Tipo de corrida
                  <select
                    value={mode}
                    disabled={locked || disabled}
                    onChange={(event) => {
                      setMode(event.target.value as LoadTestMode);
                      setPreset('CUSTOM');
                    }}
                  >
                    <option value="LOAD">Carga sostenida</option>
                    <option value="STRESS">Aumento gradual</option>
                  </select>
                </label>
                {mode === 'STRESS' && (
                  <label>
                    Aumento gradual (segundos)
                    <input
                      type="number"
                      min="1"
                      max="299"
                      value={ramp}
                      disabled={locked || disabled}
                      onChange={(event) => setRamp(event.target.value)}
                    />
                  </label>
                )}
              </div>
            </div>
          )}
          {((!active && issues.length > 0) || error || uncertain) && (
            <div className="load-validation" role="status">
              {!active && issues.map((issue) => <p key={issue}>{issue}</p>)}
              {error && <p role="alert">{error}</p>}
              {uncertain && (
                <p role="alert">
                  No se confirmó el inicio. Consulta el estado antes de otra solicitud.
                </p>
              )}
            </div>
          )}
          <div className="load-run-actions">
            <button
              className="primary"
              disabled={!valid || disabled || locked || !statusReady || environment !== 'QA'}
              onClick={() => void start()}
            >
              <Icon name="arrow" size={16} />
              {starting ? 'Verificando…' : 'Iniciar prueba'}
            </button>
            {active && (
              <button
                className="secondary"
                disabled={run.state === 'STOPPING'}
                onClick={() => void stop()}
              >
                {run.state === 'STOPPING' ? 'Deteniendo…' : 'Detener prueba'}
              </button>
            )}
          </div>
          <small className="load-test-hint">
            Máximo local: 100 operaciones, 5 TPS objetivo y una tarjeta física. La corrida se
            detiene al primer rechazo o error; no hay reintentos automáticos.
          </small>
        </section>
        <section className="load-results" aria-label="Resultado de carga">
          <div className="panel load-status-panel">
            <div className="panel-heading">
              <h2>Estado de la prueba</h2>
              <span className={'pill ' + (active ? 'amber' : 'neutral')}>
                {run ? labels[run.state] : 'Sin iniciar'}
              </span>
            </div>
            {run && metrics ? (
              <>
                <p role="status">
                  {run.state === 'COMPLETED'
                    ? 'Se alcanzó el límite de cantidad o duración.'
                    : run.message}
                </p>
                <div className="load-progress">
                  <span style={{ width: progress + '%' }} />
                </div>
                <div className="load-progress-label">
                  <span>{Math.round(progress)}% del primer límite</span>
                  <span>
                    {Math.round(run.elapsedMs / 1000)} s / {run.draft.durationSeconds} s
                  </span>
                </div>
                <div className="load-metrics">
                  {[
                    ['TPS objetivo', run.draft.targetTps.toFixed(2)],
                    ['TPS real', metrics.tps.toFixed(2)],
                    ['Enviadas', metrics.sent],
                    ['Respuestas', metrics.received],
                    ['Aprobadas', metrics.approved],
                    ['Rechazadas', metrics.declined],
                    ['Timeouts', metrics.timeouts],
                    ['Errores', metrics.errors],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
                <div className="load-data-card">
                  <div className="load-data-heading">
                    <h3>Ritmo de respuestas</h3>
                    <small>
                      Respuestas/s, ventana de 10 s · objetivo {run.draft.targetTps.toFixed(2)} TPS
                    </small>
                  </div>
                  <TpsChart run={run} />
                </div>
                <div className="load-data-card">
                  <h3>Latencia de respuesta</h3>
                  <div className="load-latencies">
                    {[
                      ['Mín.', metrics.min],
                      ['Promedio', metrics.avg],
                      ['p50', metrics.p50],
                      ['p95', metrics.p95],
                      ['p99', metrics.p99],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <span>{label}</span>
                        <strong>{ms(value as number | null)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="load-data-card">
                  <h3>¿Dónde se consume el tiempo?</h3>
                  {timed.length ? (
                    <>
                      <p className="load-test-hint">
                        Suma de {timed.length} operaciones con desglose. Las barras comparan etapas
                        medidas.
                      </p>
                      <div className="load-timing-bars">
                        {totals.map((item) => (
                          <div key={item.key}>
                            <span>{item.label}</span>
                            <div>
                              <i style={{ width: (item.value / maxTiming) * 100 + '%' }} />
                            </div>
                            <strong>{ms(item.value)}</strong>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="load-empty-chart">
                      Esta corrida anterior no guardó tiempos por etapa. Una nueva prueba mostrará
                      el desglose.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="load-empty-chart">
                Selecciona el ATM y la tarjeta; el estado y las métricas aparecerán al iniciar.
              </p>
            )}
          </div>
          {run && (
            <div className="panel load-transactions">
              <div className="panel-heading">
                <h2>Transacciones</h2>
                <span className="pill neutral">{run.items.length} registradas</span>
              </div>
              <div className="load-run-table">
                <table>
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>ATM</th>
                      <th>STAN</th>
                      <th>Estado</th>
                      <th>RC</th>
                      <th>Host</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {run.items
                      .slice(-20)
                      .reverse()
                      .map((item) => (
                        <tr key={item.requestId}>
                          <td>
                            {item.finishedAt ? new Date(item.finishedAt).toLocaleTimeString() : '—'}
                          </td>
                          <td>
                            {available.find((atm) => atm.id === run.draft.atmId)?.terminalId ??
                              'ATM QA'}
                          </td>
                          <td>{item.correlation?.stan ?? 'Sin envío'}</td>
                          <td>{item.outcome}</td>
                          <td>{item.responseCode ?? '—'}</td>
                          <td>{ms(item.elapsedMs)}</td>
                          <td>{ms(item.timings?.totalMs)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <details className="inline-details">
                <summary>Detalle y correlación</summary>
                <p>Run ID: {run.runId}</p>
                <p>
                  Objetivo {run.draft.targetTps} TPS · {run.draft.maxTransactions} consultas ·{' '}
                  {run.draft.durationSeconds} s.
                </p>
              </details>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
