import { useState } from 'react';
import { ComparisonHelp } from './ComparisonHelp';

const topics = [
  {
    id: 'comparison',
    title: 'Comparar transacciones',
    text: 'Comparador A B STAN RRN UUID campo tag diferencias solicitud respuesta reverso',
  },
  {
    id: 'operations',
    title: 'Preparar una transacción',
    text: 'QA ATM tarjeta PIN saldo retiro depósito operación',
  },
  {
    id: 'history',
    title: 'Historial y mensajes',
    text: 'Buscar fechas registros cifrado valores completos máscaras exportaciones',
  },
  {
    id: 'load',
    title: 'Carga y resultados',
    text: 'Corridas carga estrés reportes métricas evidencia',
  },
] as const;

export function InternalHelpView() {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string>('comparison');
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  const matches = topics.filter((item) =>
    normalize(`${item.title} ${item.text}`).includes(normalize(query)),
  );
  const activeTopic = matches.find((item) => item.id === topic) ?? matches[0];
  return (
    <div className="internal-help">
      <header>
        <span className="eyebrow">MANUAL DE LA ESTACIÓN</span>
        <h1>Ayuda interna</h1>
        <p>
          Guías de uso disponibles en este equipo, sin abrir GitHub ni depender de una conexión a
          Internet.
        </p>
      </header>
      <label>
        Buscar en la ayuda
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Comparar, STAN, historial, tarjeta…"
        />
      </label>
      <div className="internal-help-layout">
        <nav aria-label="Temas de ayuda">
          {matches.map((item) => (
            <button
              key={item.id}
              aria-current={activeTopic?.id === item.id ? 'page' : undefined}
              onClick={() => setTopic(item.id)}
            >
              {item.title}
            </button>
          ))}
          {!matches.length && <p>No hay temas para esa búsqueda.</p>}
        </nav>
        <article className="panel" aria-label="Contenido de ayuda">
          {!activeTopic && <p role="status">Prueba con otro término para encontrar una guía.</p>}
          {activeTopic && <h2>{activeTopic.title}</h2>}
          {activeTopic?.id === 'comparison' && (
            <>
              <p>
                Abre Reportería y auditoría → Reportes → Transacciones, elige una operación y entra
                en Mensajes → Comparar transacciones. También puedes abrir el comparador desde el
                resultado de Nueva transacción.
              </p>
              <ComparisonHelp />
            </>
          )}
          {activeTopic?.id === 'operations' && (
            <>
              <ol>
                <li>
                  Selecciona un perfil ATM de QA con configuración de envío y seguridad válidas.
                </li>
                <li>En Transacciones, elige la operación, cuenta y monto cuando corresponda.</li>
                <li>
                  Inserta y lee la tarjeta por contacto. Un perfil guardado no sustituye al chip.
                </li>
                <li>
                  Pulsa Ejecutar Transacción e ingresa el PIN únicamente en el diálogo protegido.
                </li>
                <li>
                  Revisa Flujo, Mensajes y Evidencia. Una respuesta del host no acredita por sí sola
                  el resultado final en Core.
                </li>
              </ol>
              <p>
                Producción permanece bloqueada. Las opciones no disponibles indican sus requisitos
                pendientes; no se completan con reglas supuestas.
              </p>
            </>
          )}
          {activeTopic?.id === 'history' && (
            <>
              <p>
                En Reportería y auditoría → Reportes → Transacciones se combinan saldo, retiro y
                depósito. Buscar en todo el historial permite filtrar fechas locales, tipo, STAN,
                RRN, terminal o UUID, con páginas de hasta 50 registros.
              </p>
              <p>
                Abrir un registro no reenvía la operación. Si falla la consulta se conserva la
                última página correcta y puedes actualizarla.
              </p>
              <p>
                Mensajes permite ver solicitud, respuesta y reverso realmente guardados. Mostrar
                valores completos recupera el archivo cifrado local con el mismo perfil Windows,
                incluso tras reiniciar. Los registros antiguos con máscaras no se reconstruyen.
                Salir de Mensajes retira los originales de la vista; logs y exportaciones conservan
                las protecciones.
              </p>
            </>
          )}
          {activeTopic?.id === 'load' && (
            <>
              <p>
                Configura la corrida en Carga y estrés y revisa los requisitos indicados antes de
                iniciarla. Guardar una configuración no inicia tráfico.
              </p>
              <p>
                Consulta las corridas cerradas en Reportería y auditoría → Reportes → Carga y
                estrés. Filtra y abre un detalle para revisar métricas, errores y evidencia; exporta
                desde esa vista cuando esté disponible.
              </p>
              <p>
                Los resultados locales no certifican conciliación financiera ni validación del
                host/Core. Conserva los identificadores de corrida y transacción al investigar
                incidencias.
              </p>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
