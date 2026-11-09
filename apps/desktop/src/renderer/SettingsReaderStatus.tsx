import { useEffect, useRef, useState } from 'react';
import type { CardReaderSnapshot } from '../../../../packages/domain/src/card-reader';
import type { DesktopClient } from './desktop-client';
import { readerStateLabels } from './card-reader-state';
import { Icon } from './Icon';

export function SettingsReaderStatus({
  client,
  disabled,
  onOpen,
}: {
  client: DesktopClient;
  disabled: boolean;
  onOpen(): void;
}) {
  const [snapshot, setSnapshot] = useState<Pick<CardReaderSnapshot, 'checkedAt' | 'readers'>>();
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );

  async function inspect() {
    if (disabled || pending.current) return;
    pending.current = true;
    const ticket = generation.current;
    setChecking(true);
    setSnapshot(undefined);
    setError('');
    const result = await client.call((api) => api.getReaderSnapshot(), 10000);
    if (generation.current !== ticket) return;
    if (result.ok)
      setSnapshot({ checkedAt: result.value.checkedAt, readers: result.value.readers });
    else setError(result.error.message);
    pending.current = false;
    setChecking(false);
  }

  return (
    <section className="panel settings-reader" aria-label="Comprobación del lector">
      <div className="panel-heading">
        <div>
          <h2>
            <Icon name="reader" size={18} /> Lector de tarjetas
          </h2>
          <p>Comprueba las interfaces PC/SC de esta estación.</p>
        </div>
      </div>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div role="status" className="settings-reader-result">
        {checking ? (
          'Comprobando lector…'
        ) : snapshot ? (
          <>
            {snapshot.readers.length ? (
              <ul>
                {snapshot.readers.map((reader) => (
                  <li key={reader.name}>
                    <strong>{reader.name}</strong>
                    <span>{readerStateLabels[reader.state]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No se detectaron lectores. Conecta el dispositivo y vuelve a comprobar.</p>
            )}
            <small>
              Última comprobación: {new Date(snapshot.checkedAt).toLocaleString('es-EC')}
            </small>
          </>
        ) : !error ? (
          'Sin comprobar en esta pantalla.'
        ) : (
          'No hay un estado confirmado del lector.'
        )}
      </div>
      <div className="settings-operational-actions">
        <button disabled={disabled || checking} onClick={() => void inspect()}>
          {checking ? 'Comprobando…' : 'Comprobar lector'}
        </button>
        <button disabled={disabled || checking} onClick={onOpen}>
          Administrar tarjetas <Icon name="arrow" size={14} />
        </button>
      </div>
      <p className="settings-context-note">
        Esta comprobación consulta presencia; la lectura del chip se realiza en Tarjetas o
        Transacciones.
      </p>
    </section>
  );
}
