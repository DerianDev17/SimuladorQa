import { isRestrictedCaseText } from '../../../../packages/domain/src/saved-cases';
import { useEffect, useRef, useState } from 'react';
import type { AtmProfile } from '../../../../packages/domain/src/catalogs';
import { parseSaveLoadConfiguration } from '../../../../packages/domain/src/load-configurations';
import type { SavedLoadConfiguration } from '../../../../packages/domain/src/load-configurations';
import { loadTestAtms } from '../../../../packages/domain/src/load-test';
import type { LoadTestDraft } from '../../../../packages/domain/src/load-test';
import type { Result } from '../../../../packages/shared/src/contracts';
import { DesktopClient } from './desktop-client';
const client = new DesktopClient(window.desktop);
export function LoadConfigurationsView({
  draft,
  atms,
  disabled,
  onLoad,
}: {
  draft: LoadTestDraft;
  atms: readonly AtmProfile[];
  disabled: boolean;
  onLoad(draft: LoadTestDraft): void;
}) {
  const [rows, setRows] = useState<SavedLoadConfiguration[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const generation = useRef(0);
  const selected = rows.find((row) => row.id === selectedId);
  const usable =
    selected &&
    loadTestAtms(selected.draft).every((saved) =>
      atms.some(
        (atm) =>
          atm.id === saved.atmId &&
          atm.active &&
          atm.environment === 'QA' &&
          atm.revision === saved.atmRevision,
      ),
    );
  const input = parseSaveLoadConfiguration({ id: null, revision: null, name, draft });
  const locked = disabled || busy || !ready;
  async function reload() {
    const id = ++generation.current;
    setBusy(true);
    setReady(false);
    setError('');
    setMessage('');
    setConfirmDelete(false);
    const result = await client.call((api) => api.getLoadConfigurations());
    if (id !== generation.current) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setRows(result.value);
    setReady(true);
    setSelectedId('');
    setName('');
  }
  useEffect(() => {
    void reload();
    return () => {
      generation.current++;
    };
  }, []);
  async function change(action: () => Promise<Result<SavedLoadConfiguration[]>>, success: string) {
    const id = ++generation.current;
    setBusy(true);
    setError('');
    setMessage('');
    setConfirmDelete(false);
    const result = await action();
    if (id !== generation.current) return;
    setBusy(false);
    if (!result.ok) {
      setReady(false);
      setError(result.error.message + ' Recarga para comprobar el estado guardado.');
      return;
    }
    setRows(result.value);
    setSelectedId('');
    setName('');
    setMessage(success);
  }
  return (
    <section className="panel load-history" aria-label="Configuraciones de carga y estrés">
      <h2>Configuraciones de carga y estrés</h2>
      <p>
        Guarda los parámetros del formulario actual. No se guarda tarjeta ni PIN y cargar una
        configuración no inicia una prueba.
      </p>
      <div className="load-history-filters">
        <label>
          Configuración guardada
          <select
            disabled={locked}
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setName(rows.find((row) => row.id === e.target.value)?.name ?? '');
              setConfirmDelete(false);
              setMessage('');
            }}
          >
            <option value="">Nueva configuración</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.draft.mode} · {row.draft.targetTps} TPS
              </option>
            ))}
          </select>
        </label>
        <label>
          Nombre de configuración
          <input
            disabled={locked}
            maxLength={80}
            value={name}
            onChange={(e) => {
              if (isRestrictedCaseText(e.target.value)) {
                setName('');
                setError('No incluyas datos sensibles en el nombre.');
              } else {
                setName(e.target.value);
                setError('');
              }
            }}
            placeholder="Ej. Estrés gradual QA"
          />
        </label>
      </div>
      {selected && (
        <p>
          Guardada:{' '}
          {selected.draft.operation === 'WITHDRAWAL'
            ? `Retiro USD ${selected.draft.amount}`
            : 'Saldo'}{' '}
          · {selected.draft.mode} · {selected.draft.targetTps} TPS · rampa{' '}
          {selected.draft.rampUpSeconds} s · duración {selected.draft.durationSeconds} s · máximo{' '}
          {selected.draft.maxTransactions} operaciones · revisión {selected.revision}
        </p>
      )}
      {selected && !usable && (
        <p role="status">
          Los ATM guardados cambiaron o no están disponibles. Selecciona perfiles actuales en el
          formulario y actualiza la configuración.
        </p>
      )}
      <div className="load-history-actions">
        <button
          disabled={locked || !usable}
          onClick={() => {
            if (selected && usable) {
              onLoad(structuredClone(selected.draft));
              setMessage(
                'Configuración cargada. Lee la tarjeta y revisa los parámetros antes de iniciar.',
              );
            }
          }}
        >
          Cargar configuración
        </button>
        <button
          disabled={locked || !input}
          onClick={() => {
            if (input)
              void change(
                () => client.call((api) => api.saveLoadConfiguration(input)),
                'Configuración creada.',
              );
          }}
        >
          Guardar como nueva
        </button>
        <button
          disabled={locked || !input || !selected}
          onClick={() => {
            if (input && selected)
              void change(
                () =>
                  client.call((api) =>
                    api.saveLoadConfiguration({
                      ...input,
                      id: selected.id,
                      revision: selected.revision,
                    }),
                  ),
                'Configuración actualizada.',
              );
          }}
        >
          Actualizar con el formulario
        </button>
        <button disabled={locked || !selected} onClick={() => setConfirmDelete(true)}>
          Eliminar configuración
        </button>
        <button disabled={disabled || busy} onClick={() => void reload()}>
          Recargar configuraciones
        </button>
      </div>
      {confirmDelete && selected && (
        <div role="group" aria-label="Confirmar eliminación de configuración">
          <p>¿Eliminar «{selected.name}»? Sus corridas históricas se conservan.</p>
          <button
            disabled={locked}
            onClick={() =>
              void change(
                () =>
                  client.call((api) =>
                    api.deleteLoadConfiguration({ id: selected.id, revision: selected.revision }),
                  ),
                'Configuración eliminada.',
              )
            }
          >
            Confirmar eliminación
          </button>
          <button disabled={busy} onClick={() => setConfirmDelete(false)}>
            Cancelar eliminación
          </button>
        </div>
      )}
      {busy && <p role="status">Consultando configuraciones…</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {ready && !rows.length && <p>No hay configuraciones guardadas.</p>}
      <p>
        Máximo 50 configuraciones. Para editar parámetros, cámbialos en el formulario y pulsa
        Actualizar con el formulario.
      </p>
    </section>
  );
}
