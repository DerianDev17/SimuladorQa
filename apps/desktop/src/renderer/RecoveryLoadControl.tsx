import { useEffect, useRef, useState } from 'react';
import type { LoadRunSnapshot } from '../../../../packages/domain/src/load-run';
import type { DesktopClient } from './desktop-client';

// This control stays usable even when recovery's journal checks fail. It only
// reads the existing run or stops that exact UUID; it never starts a new run.
export function RecoveryLoadControl({ client }: { client: DesktopClient }) {
  const [run, setRun] = useState<LoadRunSnapshot | null>();
  const [reading, setReading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(false);
  const stopPending = useRef(false);

  async function read() {
    if (stopPending.current) return;
    const current = ++generation.current;
    setReading(true);
    setError('');
    const result = await client.call((api) => api.getLoadRun());
    if (!mounted.current || current !== generation.current) return;
    setReading(false);
    if (result.ok) {
      setRun(result.value);
      setUncertain(false);
    } else setError(result.error.message);
  }
  useEffect(() => {
    mounted.current = true;
    void read();
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [client]);

  async function stop() {
    if (stopPending.current || uncertain || run?.state !== 'RUNNING') return;
    stopPending.current = true;
    const current = ++generation.current;
    setReading(false);
    setStopping(true);
    setError('');
    const result = await client.call((api) => api.stopLoadRun({ runId: run.runId }));
    stopPending.current = false;
    if (!mounted.current || current !== generation.current) return;
    setStopping(false);
    if (result.ok) setRun(result.value);
    else {
      setUncertain(true);
      setError(`${result.error.message} Actualiza el estado de carga antes de repetir la parada.`);
    }
  }
  const active = run?.state === 'RUNNING' || run?.state === 'STOPPING';
  return (
    <section aria-label="Carga durante recuperación">
      <h2>Control de carga</h2>
      {active && (
        <p>
          Corrida {run.runId} · {run.state === 'STOPPING' ? 'Parada en curso' : 'En ejecución'}
        </p>
      )}
      {run !== undefined && !active && (
        <p>No hay una corrida de carga activa en la última consulta.</p>
      )}
      {active && (
        <button
          disabled={stopping || uncertain || run.state === 'STOPPING'}
          onClick={() => void stop()}
        >
          {stopping
            ? 'Solicitando parada…'
            : run.state === 'STOPPING'
              ? 'Parada en curso'
              : 'Detener prueba'}
        </button>
      )}
      <button disabled={reading || stopping} onClick={() => void read()}>
        {reading ? 'Consultando carga…' : 'Actualizar estado de carga'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
