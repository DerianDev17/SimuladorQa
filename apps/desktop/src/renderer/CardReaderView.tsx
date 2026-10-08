import { useEffect, useState } from 'react';
import type { CardReaderSnapshot } from '../../../../packages/domain/src/card-reader';
import { DesktopClient } from './desktop-client';

const readerClient = new DesktopClient(window.desktop, 10000);
export function CardReaderView() {
  const [snapshot, setSnapshot] = useState<CardReaderSnapshot>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      const result = await readerClient.call((api) => api.getReaderSnapshot());
      if (!active) return;
      if (result.ok) {
        setSnapshot(result.value);
        setError(undefined);
      } else {
        setSnapshot(undefined);
        setError(result.error.message);
      }
      timer = setTimeout(() => void refresh(), 5000);
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);
  return (
    <section className="panel card-reader-view" aria-label="Estado del lector">
      <div className="panel-heading">
        <h2>Lector de tarjetas</h2>
        <span className="pill neutral">PC/SC</span>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !snapshot ? (
        <p>Consultando lector…</p>
      ) : (
        <>
          {!snapshot.readers.length && <p>No hay lectores conectados.</p>}
          {snapshot.readers.map((reader, index) => (
            <article key={`${reader.name}-${index}`}>
              <h3>{reader.name}</h3>
              <p>
                {reader.state === 'CARD_PRESENT'
                  ? 'Tarjeta presente'
                  : reader.state === 'EMPTY'
                    ? 'Sin tarjeta'
                    : 'Lector no disponible'}
              </p>
              {reader.atr && (
                <details>
                  <summary>Datos de conexión</summary>
                  <p>
                    ATR: <code>{reader.atr}</code>
                  </p>
                </details>
              )}
            </article>
          ))}
          <small>Actualizado: {new Date(snapshot.checkedAt).toLocaleTimeString()}</small>
        </>
      )}
      <p className="document-note">
        La presencia de la tarjeta no identifica su cuenta ni genera PIN o datos de autorización. La
        lectura de identidad y el perfil transaccional requieren validación.
      </p>
    </section>
  );
}
