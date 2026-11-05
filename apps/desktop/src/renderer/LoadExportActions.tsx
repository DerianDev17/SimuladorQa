import { useEffect, useRef, useState } from 'react';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import type { LoadExportFormat } from '../../../../packages/domain/src/load-export';
import { DesktopClient } from './desktop-client';
const client = new DesktopClient(window.desktop);
export function LoadExportActions({ run }: { run: LoadRunSnapshot }) {
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
  async function save(format: LoadExportFormat) {
    const id = ++generation.current;
    setBusy(true);
    setMessage('');
    setError('');
    const result = await client.call(
      (api) => api.exportLoadRun({ runId: run.runId, format }),
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
    <div aria-label="Exportar evidencia de carga">
      <div className="load-history-actions">
        <button disabled={busy || active} onClick={() => void save('CSV')}>
          Exportar CSV
        </button>
        <button disabled={busy || active} onClick={() => void save('JSON')}>
          Exportar JSON
        </button>
      </div>
      {active && (
        <p>La exportación estará disponible al cerrar la corrida. Actualiza el detalle después.</p>
      )}
      {busy && <p role="status">Selecciona dónde guardar la evidencia…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
