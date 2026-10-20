import { useState } from 'react';
import type { Environment } from '../../../../packages/domain/src/index';
import type { VirtualCardFixture } from '../../../../packages/domain/src/virtual-card-fixtures';
import { Icon } from './Icon';
import { DesktopClient } from './desktop-client';

interface VirtualCardGeneratorViewProps {
  environment: Environment;
}

export function VirtualCardGeneratorView({ environment }: VirtualCardGeneratorViewProps) {
  const [count, setCount] = useState('5');
  const [cards, setCards] = useState<VirtualCardFixture[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const generate = async () => {
    if (busy || environment !== 'QA') return;
    setBusy(true);
    setError(undefined);
    const result = await new DesktopClient(window.desktop).call((api) =>
      api.generateVirtualCardFixtures({ count: Number(count) }),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setCards((current) => [...result.value, ...current]);
  };

  return (
    <section className="panel virtual-card-generator" aria-label="Generador local de tarjetas">
      <div className="panel-heading">
        <div>
          <h2>Generador local de tarjetas</h2>
          <p>Referencias VISA ficticias para ensayar pantallas del simulador</p>
        </div>
        <span className="pill neutral">Solo QA local</span>
      </div>
      <div className="virtual-card-generator-controls">
        <label>
          Cantidad
          <select
            aria-label="Cantidad de tarjetas a generar"
            value={count}
            onChange={(event) => setCount(event.target.value)}
            disabled={busy || environment !== 'QA'}
          >
            {[1, 5, 10, 20].map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? 'tarjeta' : 'tarjetas'}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          disabled={busy || environment !== 'QA'}
          onClick={() => void generate()}
        >
          <Icon name="card" size={16} />
          {busy ? 'Generando…' : 'Generar referencias'}
        </button>
        {cards.length > 0 && (
          <button className="text-button" disabled={busy} onClick={() => setCards([])}>
            Limpiar lista
          </button>
        )}
      </div>
      {environment !== 'QA' && (
        <p className="virtual-card-error" role="status">
          Cambia el ambiente a QA para generar referencias locales.
        </p>
      )}
      {error && (
        <p className="virtual-card-error" role="alert">
          {error}
        </p>
      )}
      <div className="virtual-card-notice">
        <Icon name="shield" size={17} />
        <p>
          Son identificadores ficticios: no incluyen PAN, vencimiento, CVV, PIN ni datos EMV y no
          pueden enviarse a SmartVista/Core. Para una prueba real se necesita el adaptador del pool
          QA y su mecanismo autorizado de PIN/EMV dinámicos.
        </p>
      </div>
      {cards.length > 0 ? (
        <div className="virtual-card-list" aria-live="polite">
          <div className="virtual-card-list-heading">
            <h3>Referencias de esta sesión</h3>
            <span>{cards.length}</span>
          </div>
          {cards.map((card) => (
            <article className="virtual-card-row" key={card.id}>
              <span className="virtual-card-brand">VISA</span>
              <div>
                <strong>{card.reference}</strong>
                <small>Simulación local · {new Date(card.createdAt).toLocaleTimeString()}</small>
              </div>
              <span className="pill neutral">Sin credenciales</span>
            </article>
          ))}
        </div>
      ) : (
        <p className="virtual-card-empty">Todavía no hay referencias generadas en esta sesión.</p>
      )}
    </section>
  );
}
