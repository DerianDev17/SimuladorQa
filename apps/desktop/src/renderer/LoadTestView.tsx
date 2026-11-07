import { LoadResultsView } from './LoadResultsView';
import { LoadConfigurationsView } from './LoadConfigurationsView';
import { stressPreset } from '../../../../packages/domain/src/load-configurations';
import { LoadHistoryView } from './LoadHistoryView';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import type { Environment } from '../../../../packages/domain/src/index';
import type {
  LoadTestDraft,
  LoadTestMode,
  LoadTestOperation,
} from '../../../../packages/domain/src/load-test';
import { isWithdrawalAmount } from '../../../../packages/domain/src/withdrawal';
import {
  LOAD_TEST_LOCAL_MIN_TPS,
  LOAD_TEST_LOCAL_MAX_TPS,
} from '../../../../packages/domain/src/load-test';
import {
  LOAD_RUN_MAX_OPERATIONS,
  LOAD_RUN_MAX_SECONDS,
  LOAD_RUN_MAX_CONCURRENCY,
  parseLoadRunRequest,
} from '../../../../packages/domain/src/load-run';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import { DesktopClient } from './desktop-client';
import { CardReaderView } from './CardReaderView';
import type { TransactionCard } from './transaction-card';
import { Icon } from './Icon';
import type { Result } from '../../../../packages/shared/src/contracts';

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
export function LoadTestView({ environment, atms, disabled, onBusyChange }: Props) {
  const available = useMemo(
    () => atms.filter((atm) => atm.active && atm.environment === 'QA'),
    [atms],
  );
  const [atmIds, setAtmIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<Preset>('QUICK');
  const [configurationsOpen, setConfigurationsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [mode, setMode] = useState<LoadTestMode>('LOAD');
  const [operation, setOperation] = useState<LoadTestOperation>('BALANCE');
  const [amount, setAmount] = useState('');
  const [count, setCount] = useState('30');
  const [tps, setTps] = useState('1');
  const [concurrency, setConcurrency] = useState('2');
  const [duration, setDuration] = useState('30');
  const [ramp, setRamp] = useState('10');
  const [card, setCard] = useState<TransactionCard>();
  const [run, setRun] = useState<LoadRunSnapshot | null>(null);
  const [error, setError] = useState<string>();
  const [starting, setStarting] = useState(false);
  const [statusReady, setStatusReady] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pendingStart = useRef<string | null>(null);
  const statusVersion = useRef(0);
  const mounted = useRef(true);
  const refreshStatus = useRef<() => void>(() => {});
  const active = !!run && ['RUNNING', 'STOPPING'].includes(run.state);
  const locked = active || starting || uncertain;
  const client = new DesktopClient(window.desktop);
  const selected = available.find((atm) => atm.id === atmIds[0]);
  const draft: LoadTestDraft = {
    environment: 'QA',
    ...(operation === 'WITHDRAWAL' ? { operation, amount } : { operation }),
    mode,
    atmId: selected?.id ?? '',
    atmRevision: selected?.revision ?? 0,
    ...(atmIds.length > 1
      ? {
          additionalAtms: atmIds.slice(1).map((atmId) => ({
            atmId,
            atmRevision: available.find((atm) => atm.id === atmId)?.revision ?? 0,
          })),
        }
      : {}),
    maxTransactions: Number(count),
    targetTps: Number(tps),
    concurrency: operation === 'WITHDRAWAL' ? 1 : Number(concurrency),
    rampUpSeconds: mode === 'STRESS' ? Number(ramp) : 0,
    durationSeconds: Number(duration),
  };
  useEffect(() => {
    if (locked) return;
    setAtmIds((ids) => {
      const next = ids.filter((id) => available.some((atm) => atm.id === id));
      if (!next.length && available.length === 1) next.push(available[0]!.id);
      return next.length === ids.length && next.every((id, index) => id === ids[index])
        ? ids
        : next;
    });
  }, [atms, locked]);
  useEffect(() => {
    onBusyChange(locked);
    return () => onBusyChange(false);
  }, [locked, onBusyChange]);
  useEffect(() => {
    let live = true;
    mounted.current = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      const version = statusVersion.current;
      const result = await client.call((api) => api.getLoadRun());
      pending = false;
      if (!live) return;
      if (version !== statusVersion.current) {
        timer = setTimeout(() => void refresh(), 1000);
        return;
      }
      setStatusReady(result.ok);
      if (result.ok) {
        setRun(result.value);
        if (pendingStart.current && result.value?.requestId === pendingStart.current) {
          pendingStart.current = null;
          statusVersion.current++;
          setStarting(false);
          setUncertain(false);
          setError(undefined);
          setCard(undefined);
        }
      } else setError(result.error.message);
      const pollingActive =
        pendingStart.current ||
        !result.ok ||
        (result.value && ['RUNNING', 'STOPPING'].includes(result.value.state));
      timer = setTimeout(() => void refresh(), pollingActive ? 1000 : 5000);
    };
    refreshStatus.current = () => {
      clearTimeout(timer);
      void refresh();
    };
    void refresh();
    return () => {
      live = false;
      mounted.current = false;
      clearTimeout(timer);
      refreshStatus.current = () => {};
    };
  }, []);
  const valid =
    !!card &&
    !!selected &&
    atmIds.every((id) => available.some((atm) => atm.id === id)) &&
    !!parseLoadRunRequest({
      requestId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      cardReadId: card.readId,
      draft,
    });
  const issues = [
    ...(operation === 'WITHDRAWAL' && !isWithdrawalAmount(amount)
      ? ['Ingresa un monto de retiro entre 0.01 y 9999999999.99 USD, con punto y dos decimales.']
      : []),
    ...(!Number.isInteger(Number(concurrency)) ||
    Number(concurrency) < 1 ||
    Number(concurrency) > LOAD_RUN_MAX_CONCURRENCY
      ? ['La concurrencia debe estar entre 1 y 5 operaciones.']
      : []),
    ...(environment !== 'QA' ? ['Selecciona el ambiente QA.'] : []),
    ...(!atmIds.length ? ['Selecciona un ATM QA.'] : []),
    ...(atmIds.some((id) => !available.some((atm) => atm.id === id))
      ? ['Uno de los ATM seleccionados ya no está disponible. Vuelve a seleccionar los perfiles.']
      : []),
    ...(Number(count) < atmIds.length
      ? ['La cantidad debe permitir al menos una operación por ATM seleccionado.']
      : []),
    ...(!card ? ['Lee y selecciona la tarjeta física QA.'] : []),
    ...(Number(count) < 1 ||
    Number(count) > LOAD_RUN_MAX_OPERATIONS ||
    !Number.isSafeInteger(Number(count))
      ? ['La cantidad debe estar entre 1 y ' + LOAD_RUN_MAX_OPERATIONS + '.']
      : []),
    ...(!Number.isFinite(Number(tps)) ||
    Number(tps) < LOAD_TEST_LOCAL_MIN_TPS ||
    Number(tps) > LOAD_TEST_LOCAL_MAX_TPS
      ? ['El objetivo debe estar entre 0,1 y 5 TPS.']
      : []),
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
    setConcurrency(String(choice.tps >= 3 ? LOAD_RUN_MAX_CONCURRENCY : 2));
    setDuration(String(choice.seconds));
  }
  function applyConfiguration(saved: LoadTestDraft) {
    if (locked || disabled) return;
    setAtmIds(
      [saved.atmId, ...(saved.additionalAtms ?? []).map((atm) => atm.atmId)].filter(Boolean),
    );
    setOperation(saved.operation);
    setAmount(saved.operation === 'WITHDRAWAL' ? saved.amount : '');
    setMode(saved.mode);
    setPreset('CUSTOM');
    setAdvanced(true);
    setCount(String(saved.maxTransactions));
    setTps(String(saved.targetTps));
    setConcurrency(String(saved.concurrency));
    setDuration(String(saved.durationSeconds));
    setRamp(String(saved.rampUpSeconds));
    setCard(undefined);
    setError(undefined);
  }
  async function start() {
    if (!valid || !card || locked || disabled || !statusReady || environment !== 'QA') return;
    const requestId = crypto.randomUUID();
    pendingStart.current = requestId;
    statusVersion.current++;
    setStarting(true);
    setError(undefined);
    refreshStatus.current();
    const accept = (result: Result<LoadRunSnapshot>) => {
      if (!mounted.current || pendingStart.current !== requestId) return;
      pendingStart.current = null;
      statusVersion.current++;
      setStarting(false);
      setUncertain(false);
      if (result.ok) {
        setRun(result.value);
        setCard(undefined);
        setError(undefined);
      } else setError(result.error.message);
      refreshStatus.current();
    };
    const result = await client.call(
      async (api) => {
        const confirmed = await api.startLoadRun({ requestId, cardReadId: card.readId, draft });
        accept(confirmed);
        return confirmed;
      },
      20000,
      'El inicio aún no está confirmado. Se consultará su estado sin repetir la solicitud.',
    );
    if (!mounted.current || pendingStart.current !== requestId) return;
    if (!result.ok) {
      setError(result.error.message);
      setUncertain(true);
    }
    setStarting(false);
  }
  async function stop() {
    if (!run) return;
    statusVersion.current++;
    const result = await client.call((api) => api.stopLoadRun({ runId: run.runId }));
    if (!mounted.current) return;
    statusVersion.current++;
    if (result.ok) {
      setRun(result.value);
    } else setError(result.error.message);
    refreshStatus.current();
  }
  return (
    <div className="load-test-view">
      <header className="load-test-heading">
        <div>
          <h1>Carga y estrés</h1>
          <p>Pruebas QA de saldo y retiro con resultados medidos en cada etapa.</p>
        </div>
        <div className="load-assistant">
          <Icon name="load" size={24} />
          <span>
            <strong>Asistente de pruebas</strong>
            <small>Selecciona ATM, escenario y tarjeta; el sistema valida al iniciar.</small>
          </span>
        </div>
      </header>
      <div className="load-history-actions">
        <button aria-expanded={historyOpen} onClick={() => setHistoryOpen(!historyOpen)}>
          {historyOpen ? 'Ocultar historial de carga' : 'Ver historial de carga'}
        </button>
        <button
          aria-expanded={configurationsOpen}
          onClick={() => setConfigurationsOpen(!configurationsOpen)}
        >
          {configurationsOpen ? 'Ocultar configuraciones' : 'Configuraciones guardadas'}
        </button>
      </div>
      {historyOpen &&
        (environment === 'QA' ? (
          <LoadHistoryView atms={atms} />
        ) : (
          <p>Selecciona QA para consultar el historial de carga.</p>
        ))}
      {configurationsOpen &&
        (environment === 'QA' ? (
          <LoadConfigurationsView
            draft={draft}
            atms={atms}
            disabled={locked || disabled || !statusReady}
            onLoad={applyConfiguration}
          />
        ) : (
          <p>Selecciona QA para consultar las configuraciones.</p>
        ))}
      <div className="load-test-columns">
        <section className="panel load-setup" aria-label="Configurar prueba">
          <details className="inline-details">
            <summary>Pruebas de estrés</summary>
            <div className="load-history-actions" aria-label="Presets de estrés">
              <button
                disabled={locked || disabled || environment !== 'QA'}
                onClick={() => applyConfiguration(stressPreset(draft, 3))}
              >
                Estrés gradual · 3 TPS
              </button>
              <button
                disabled={locked || disabled || environment !== 'QA'}
                onClick={() => applyConfiguration(stressPreset(draft, 5))}
              >
                Estrés gradual · 5 TPS
              </button>
            </div>
            <p className="load-test-hint">
              Estrés: rampa de 20 s, hasta 60 s o 100 operaciones. Retiro siempre secuencial; los
              TPS son objetivos.
            </p>
          </details>
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
                      name="load-atm"
                      checked={atmIds.includes(atm.id)}
                      disabled={locked || disabled}
                      onChange={() =>
                        setAtmIds((ids) =>
                          ids.includes(atm.id)
                            ? ids.filter((id) => id !== atm.id)
                            : [...ids, atm.id],
                        )
                      }
                    />
                    {atm.alias} · {atm.terminalId}
                  </label>
                ))}
              </div>
            </details>
            <p className="load-inline-note">
              Las operaciones se reparten entre los ATM seleccionados. El enlace QA atiende un envío
              a la vez para conservar cada respuesta. TPS, cantidad y operaciones en preparación son
              totales de la corrida.
            </p>
          </div>
          <div className="load-step">
            <div className="load-step-title">
              <h2>2. Escenario de prueba</h2>
            </div>
            <div className="load-test-form">
              <label>
                Operación de carga
                <select
                  value={operation}
                  disabled={locked || disabled}
                  onChange={(event) => setOperation(event.target.value as LoadTestOperation)}
                >
                  <option value="BALANCE">Consulta de saldo</option>
                  <option value="WITHDRAWAL">Retiro</option>
                </select>
              </label>
              {operation === 'WITHDRAWAL' && (
                <label>
                  Monto por retiro (USD)
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    placeholder="20.00"
                    disabled={locked || disabled}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </label>
              )}
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
              PIN una vez por corrida y seguridad EMV nueva por operación.
            </p>
            <label>
              Operaciones en preparación y envío
              <select
                value={operation === 'WITHDRAWAL' ? '1' : concurrency}
                disabled={locked || disabled || operation === 'WITHDRAWAL'}
                onChange={(event) => setConcurrency(event.target.value)}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value === 1 ? '1 · secuencial' : `${value} · en curso`}
                  </option>
                ))}
              </select>
            </label>
            <p className="load-inline-note">
              {operation === 'WITHDRAWAL' ? (
                'Los retiros se ejecutan uno a uno, con el mismo monto por operación. Cada retiro espera su respuesta antes del siguiente; el host determina si se aprueba.'
              ) : (
                <>
                  El chip prepara una consulta a la vez y puede avanzar mientras el host responde a
                  la anterior. El enlace permite una sola conexión financiera; las demás consultas
                  esperan su turno. Más operaciones en curso no garantizan alcanzar los TPS
                  objetivo.
                </>
              )}
            </p>
          </div>
          <div className="load-fixed-operation">
            <strong>
              Transacción: {operation === 'WITHDRAWAL' ? 'retiro' : 'consulta de saldo'}
            </strong>
            <small>
              QA · local · ahorros · tarjeta presente. Se valida el contrato de cada ATM al iniciar.
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
                    min={LOAD_TEST_LOCAL_MIN_TPS}
                    max={LOAD_TEST_LOCAL_MAX_TPS}
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
        <LoadResultsView run={run} available={available} />
      </div>
    </div>
  );
}
