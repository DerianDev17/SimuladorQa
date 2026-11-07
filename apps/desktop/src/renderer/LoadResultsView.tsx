import { memo } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import { loadTargetTps } from '../../../../packages/domain/src/load-test';
import { loadRunMetrics, loadResponseSeries } from '../../../../packages/domain/src/load-run';
import type { LoadRunSnapshot, LoadRunTimings } from '../../../../packages/domain/src/load-run';

const labels = {
  RUNNING: 'En ejecución',
  STOPPING: 'Deteniendo',
  COMPLETED: 'Completada',
  STOPPED: 'Detenida',
  FAILED: 'Detenida por error',
  INTERRUPTED: 'Interrumpida',
};
const stages: { key: keyof LoadRunTimings; label: string }[] = [
  { key: 'queueWaitMs', label: 'Espera del lector' },
  { key: 'connectionWaitMs', label: 'Espera del enlace' },
  { key: 'rateLimitMs', label: 'Espera por límite TPS' },
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
  if (
    !run.items.some(
      (item) => item.received && (item.finishedAt || item.finishedElapsedMs !== undefined),
    )
  )
    return (
      <p className="load-empty-chart">
        Aún no hay respuestas con fecha registrada para mostrar la serie.
      </p>
    );
  const horizon = Math.max(
    run.state === 'RUNNING' ? run.draft.durationSeconds * 1000 : 0,
    run.elapsedMs,
    1000,
  );
  const ceiling = Math.max(5, run.draft.targetTps);
  const point = (time: number, rate: number) =>
    `${Math.round((time * 500) / horizon)},${Math.round(112 - (Math.min(rate, ceiling) * 112) / ceiling)}`;
  const points = loadResponseSeries(run).map(({ elapsedMs, tps }) => point(elapsedMs, tps));
  const targets = Array.from({ length: 41 }, (_, index) => {
    const at = (Math.min(horizon, run.draft.durationSeconds * 1000) * index) / 40;
    return point(at, loadTargetTps(run.draft, at));
  });
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
        <polyline points={targets.join(' ')} fill="none" className="load-target-line" />
        <polyline points={points.join(' ')} className="load-actual-line" />
      </svg>
      <div className="load-chart-caption">
        <span>Inicio</span>
        <span>{Math.round(horizon / 1000)} s</span>
      </div>
    </div>
  );
}

export const LoadResultsView = memo(function LoadResultsView({
  run,
  available,
}: {
  run: LoadRunSnapshot | null;
  available: readonly AtmProfile[];
}) {
  const active = !!run && ['RUNNING', 'STOPPING'].includes(run.state);
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
  const belowTarget =
    !!run &&
    run.state === 'COMPLETED' &&
    run.draft.mode === 'LOAD' &&
    !!metrics &&
    metrics.tps < run.draft.targetTps;
  return (
    <section className="load-results" aria-label="Resultado de carga">
      <div className="panel load-status-panel">
        <div className="panel-heading">
          <h2>Estado de la prueba</h2>
          <span className={'pill ' + (active || (run && belowTarget) ? 'amber' : 'neutral')}>
            {run ? labels[run.state] : 'Sin iniciar'}
            {run && belowTarget ? ' · TPS no alcanzados' : ''}
          </span>
        </div>
        {run && metrics ? (
          <>
            <p>
              {run.draft.operation === 'WITHDRAWAL'
                ? `Retiro · USD ${run.draft.amount} por operación`
                : 'Consulta de saldo'}{' '}
              · {run.draft.concurrency} en curso como máximo
            </p>
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
                En curso: {run.active} · {Math.round(run.elapsedMs / 1000)} s /{' '}
                {run.draft.durationSeconds} s
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
                ['Canceladas', metrics.cancelled],
                ['Enviadas sin respuesta', metrics.unconfirmed],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <div className="load-data-card">
              {belowTarget && (
                <p role="status">
                  Objetivo TPS no alcanzado: {metrics.tps.toFixed(2)} de{' '}
                  {run.draft.targetTps.toFixed(2)} TPS de promedio. Finalizar por cantidad o
                  duración no acredita el ritmo solicitado.
                </p>
              )}
              <small className="load-test-hint">
                TPS real: envíos / tiempo total, incluida preparación y espera de las últimas
                respuestas. Revisa la gráfica para evaluar el ritmo sostenido.
              </small>
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
                  ['p90', metrics.p90],
                  ['p95', metrics.p95],
                  ['p99', metrics.p99],
                  ['Máx.', metrics.max],
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
                    medidas. Las esperas simultáneas se superponen; su suma puede superar la
                    duración de la corrida.
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
                  Esta corrida anterior no guardó tiempos por etapa. Una nueva prueba mostrará el
                  desglose.
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
                        {item.correlation?.terminalId ??
                          available.find((atm) => atm.id === (item.atmId ?? run.draft.atmId))
                            ?.terminalId ??
                          'ATM QA'}
                      </td>
                      <td>{item.correlation?.stan ?? 'Sin envío'}</td>
                      <td>
                        {item.cancelled
                          ? item.sent
                            ? 'Cancelada · sin respuesta'
                            : 'Cancelada · sin envío'
                          : item.outcome}
                      </td>
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
              Objetivo {run.draft.targetTps} TPS · {run.draft.maxTransactions} operaciones ·{' '}
              {run.draft.durationSeconds} s.
            </p>
          </details>
        </div>
      )}
    </section>
  );
});
