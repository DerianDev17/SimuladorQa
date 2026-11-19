import { useEffect, useRef, useState } from 'react';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import type {
  LoadExportFormat,
  LoadReportAudience,
} from '../../../../packages/domain/src/load-export';
import { DesktopClient } from './desktop-client';
import './load-reporting.css';
const client = new DesktopClient(window.desktop);
export function LoadExportActions({ run }: { run: Pick<LoadRunSnapshot, 'runId' | 'state'> }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  async function save(format: LoadExportFormat, audience?: LoadReportAudience) {
    const id = ++generation.current;
    setBusy(true);
    setMessage('');
    setError('');
    const result = await client.call(
      (api) => api.exportLoadRun({ runId: run.runId, format, ...(audience ? { audience } : {}) }),
      125_000,
      'No llegó la confirmación de exportación. Revisa la ubicación elegida y cierra el diálogo antes de repetir.',
    );
    if (id !== generation.current) return;
    setBusy(false);
    if (!result.ok) setError(result.error.message);
    else setMessage(result.value === 'SAVED' ? 'Evidencia guardada.' : 'Exportación cancelada.');
  }
  const active = run.state === 'RUNNING' || run.state === 'STOPPING';
  return (
    <section className="load-export-panel" aria-label="Exportar evidencia de carga">
      <div className="load-export-heading">
        <div>
          <span className="load-report-eyebrow">REPORTERÍA</span>
          <h4>Elige el informe para tu audiencia</h4>
          <p>Dos lecturas de la misma corrida, listas para compartir e imprimir.</p>
        </div>
        <span className="load-report-badge">HTML · Imprimible</span>
      </div>
      <div className="load-report-options">
        {(
          [
            {
              audience: 'BUSINESS',
              title: 'Informe de negocio',
              subtitle: 'Para decisiones y seguimiento',
              description: 'Alcance, resultados, pendientes y próximos pasos por área.',
              tags: 'Resumen ejecutivo · Pendientes',
            },
            {
              audience: 'TECHNICAL',
              title: 'Informe técnico',
              subtitle: 'Para análisis y diagnóstico',
              description:
                'Configuración, rendimiento, tiempos por etapa y detalle de cada operación.',
              tags: 'Métricas · Trazabilidad',
            },
          ] as const
        ).map((option) => (
          <article className="load-report-option" key={option.audience}>
            <div className="load-report-option-heading">
              <span className="load-report-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 3h8l4 4v14H6z M14 3v5h4" />
                  {option.audience === 'BUSINESS' ? (
                    <path d="M9 12h6M9 15h6M9 18h4" />
                  ) : (
                    <path d="M9 18v-4m3 4v-7m3 7v-5" />
                  )}
                </svg>
              </span>
              <div>
                <h5>{option.title}</h5>
                <span>{option.subtitle}</span>
              </div>
            </div>
            <p>{option.description}</p>
            <span className="load-report-tags">{option.tags}</span>
            <button disabled={busy || active} onClick={() => void save('HTML', option.audience)}>
              {option.title}
              <span aria-hidden="true">↓</span>
            </button>
          </article>
        ))}
      </div>
      <div className="load-export-data">
        <div>
          <strong>Datos para análisis</strong>
          <p>CSV para hojas de cálculo · JSON para procesamiento.</p>
        </div>
        <div className="load-export-data-actions">
          <button disabled={busy || active} onClick={() => void save('CSV')}>
            Exportar CSV
          </button>
          <button disabled={busy || active} onClick={() => void save('JSON')}>
            Exportar JSON
          </button>
        </div>
      </div>
      {active && (
        <p className="load-export-notice">
          La exportación estará disponible al cerrar la corrida. Actualiza el detalle después.
        </p>
      )}
      {busy && (
        <p className="load-export-feedback" role="status">
          Selecciona dónde guardar la evidencia…
        </p>
      )}
      {message && (
        <p className="load-export-feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="load-export-feedback load-export-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
