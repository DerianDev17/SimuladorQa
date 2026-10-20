import { useEffect, useState } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import type { Environment } from '../../../../packages/domain/src/index';
import type { LoadTestDraft, LoadTestMode } from '../../../../packages/domain/src/load-test';
import { loadRunMetrics, parseLoadRunRequest } from '../../../../packages/domain/src/load-run';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import { DesktopClient } from './desktop-client';
import { CardReaderView } from './CardReaderView';
import type { TransactionCard } from './transaction-card';
import { Icon } from './Icon';

interface LoadTestViewProps {
  environment: Environment | undefined;
  atms: readonly AtmProfile[];
  disabled: boolean;
  onBusyChange(busy: boolean): void;
}
const labels = {
  RUNNING: 'En ejecución',
  STOPPING: 'Deteniendo',
  COMPLETED: 'Completada',
  STOPPED: 'Detenida',
  FAILED: 'Detenida por error',
  INTERRUPTED: 'Interrumpida',
};
export function LoadTestView({ environment, atms, disabled, onBusyChange }: LoadTestViewProps) {
  const available = atms.filter((atm) => atm.active && atm.environment === 'QA');
  const [atmId, setAtmId] = useState('');
  const [mode, setMode] = useState<LoadTestMode>('LOAD');
  const [count, setCount] = useState('10');
  const [tps, setTps] = useState('5');
  const [duration, setDuration] = useState('60');
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
  const selected = available.find((atm) => atm.id === atmId);
  const draft: LoadTestDraft = {
    environment: 'QA',
    operation: 'BALANCE',
    mode,
    atmId,
    atmRevision: selected?.revision ?? 0,
    maxTransactions: Number(count),
    targetTps: Number(tps),
    concurrency: 1,
    rampUpSeconds: mode === 'STRESS' ? Number(ramp) : 0,
    durationSeconds: Number(duration),
  };
  useEffect(() => {
    if (!atmId && available.length === 1) setAtmId(available[0]!.id);
  }, [atms, atmId]);
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
    !!parseLoadRunRequest({
      requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      cardReadId: card.readId,
      draft,
    });
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
  const latency = (value: number | null | undefined) =>
    value == null ? '—' : `${Math.round(value)} ms`;
  return (
    <div className="load-test-view">
      <header className="load-test-heading">
        <h1>Carga y estrés</h1>
        <span className="pill neutral">Saldo · QA · tarjeta física</span>
      </header>
      <div className="load-test-columns">
        <section className="panel">
          <div className="panel-heading">
            <h2>Preparar prueba</h2>
            <span className="pill neutral">Hasta 5 TPS</span>
          </div>
          <div className="load-test-form">
            <label>
              Perfil ATM QA
              <select
                aria-label="Perfil ATM QA"
                value={atmId}
                disabled={locked || disabled}
                onChange={(event) => setAtmId(event.target.value)}
              >
                <option value="">Selecciona un perfil</option>
                {available.map((atm) => (
                  <option value={atm.id} key={atm.id}>
                    {atm.alias} · {atm.terminalId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de corrida
              <select
                aria-label="Tipo de corrida"
                value={mode}
                disabled={locked || disabled}
                onChange={(event) => setMode(event.target.value as LoadTestMode)}
              >
                <option value="LOAD">Carga sostenida</option>
                <option value="STRESS">Aumento gradual</option>
              </select>
            </label>
            <label>
              Máximo de operaciones
              <input
                type="number"
                min="1"
                max="100"
                value={count}
                disabled={locked || disabled}
                onChange={(event) => setCount(event.target.value)}
              />
            </label>
            <label>
              TPS objetivo
              <input
                type="number"
                min="0.1"
                step="0.1"
                max="5"
                value={tps}
                disabled={locked || disabled}
                onChange={(event) => setTps(event.target.value)}
              />
            </label>
            <label>
              Duración máxima (segundos)
              <input
                type="number"
                min="1"
                max="300"
                value={duration}
                disabled={locked || disabled}
                onChange={(event) => setDuration(event.target.value)}
              />
            </label>
            <label>
              Concurrencia
              <input value="1 · una tarjeta física" readOnly />
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
          <div className="load-card-source">
            <h3>Tarjeta de la prueba</h3>
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
              <p>Consultas con la tarjeta seleccionada. Mantenla insertada hasta terminar.</p>
            )}
            <p className="load-test-hint">
              Consulta de ahorros. El PIN se solicita una vez; cada consulta genera seguridad y
              secuencia nuevas. El lector trabaja en serie: los TPS reales pueden ser inferiores al
              objetivo.
            </p>
          </div>
          {environment !== 'QA' && <p role="alert">La ejecución está disponible solo en QA.</p>}
          {error && (
            <p className="saved-card-error" role="alert">
              {error}
            </p>
          )}
          {uncertain && (
            <p role="alert">
              No se confirmó el inicio. Revisa el estado y detén la corrida si aparece activa; no
              repitas la solicitud.
            </p>
          )}
          <div className="load-run-actions">
            <button
              className="primary"
              disabled={!valid || disabled || locked || !statusReady || environment !== 'QA'}
              onClick={() => void start()}
            >
              <Icon name="load" size={16} />
              {starting ? 'Verificando…' : 'Iniciar prueba de saldo'}
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
            Se detiene al alcanzar cantidad o duración, retirar la tarjeta o recibir el primer
            rechazo/error. Sin reintentos automáticos.
          </small>
        </section>
        <section className="panel load-run-result" aria-label="Resultado de carga">
          <div className="panel-heading">
            <h2>{run ? 'Resultado de la corrida' : 'Estado de ejecución'}</h2>
            <span className={`pill ${active ? 'amber' : 'neutral'}`}>
              {run ? labels[run.state] : 'Sin iniciar'}
            </span>
          </div>
          {run && metrics ? (
            <>
              <p role="status">
                {active
                  ? run.message
                  : run.state === 'COMPLETED'
                    ? 'Se alcanzó el límite de cantidad o duración.'
                    : run.message}
              </p>
              <div className="load-metrics">
                {[
                  ['Enviadas', metrics.sent],
                  ['Respuestas', metrics.received],
                  ['Aprobadas', metrics.approved],
                  ['Rechazadas', metrics.declined],
                  ['Timeouts', metrics.timeouts],
                  ['Errores', metrics.errors],
                  ['TPS alcanzados', metrics.tps.toFixed(2)],
                  ['En curso', run.active],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
              <p className="load-test-hint">
                Latencia de respuestas: p50 {latency(metrics.p50)} · p95 {latency(metrics.p95)} ·
                p99 {latency(metrics.p99)}
              </p>
              <details className="inline-details">
                <summary>Detalle y correlación</summary>
                <p>Run ID: {run.runId}</p>
                <p>
                  Objetivo: {run.draft.targetTps} TPS · {run.draft.maxTransactions} consultas ·{' '}
                  {run.draft.durationSeconds} s
                </p>
                <p>
                  Inicio: {new Date(run.startedAt).toLocaleString()} · transcurrido:{' '}
                  {(run.elapsedMs / 1000).toFixed(1)} s
                </p>
                <p>
                  Mín. {latency(metrics.min)} · Media {latency(metrics.avg)} · Máx.{' '}
                  {latency(metrics.max)} · p90 {latency(metrics.p90)}
                </p>
                <div className="load-run-table">
                  <table>
                    <thead>
                      <tr>
                        <th>STAN</th>
                        <th>Resultado</th>
                        <th>RC</th>
                        <th>Tiempo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.items.map((item) => (
                        <tr key={item.requestId}>
                          <td>{item.correlation?.stan ?? 'Sin envío'}</td>
                          <td>{item.outcome}</td>
                          <td>{item.responseCode ?? '—'}</td>
                          <td>{latency(item.elapsedMs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          ) : (
            <p className="load-test-hint">
              Selecciona el ATM, lee tu tarjeta e inicia la prueba. Antes del primer envío se
              verifican el perfil financiero, el cifrado y las secuencias disponibles.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
