import { useState } from 'react';
import type { AuditEntry } from './reporting';
import { reportingOrigins } from './reporting';

export function ReportingAuditView({
  entries,
  preview = false,
  onOpen,
}: {
  entries: readonly AuditEntry[];
  preview?: boolean;
  onOpen?: () => void;
}) {
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string>();
  const last = Math.max(0, Math.ceil(entries.length / 15) - 1);
  const current = Math.min(page, last);
  const visible = preview ? entries.slice(0, 4) : entries.slice(current * 15, (current + 1) * 15);
  const detail = entries.find((item) => item.key === selected);
  return (
    <section className="panel reporting-audit" aria-label="Actividad de auditoría">
      <div className="panel-heading">
        <div>
          <h2>Actividad de auditoría</h2>
          <p>Configuración, catálogos, casos y configuraciones de carga.</p>
        </div>
        {preview && (
          <button className="text-button" onClick={onOpen}>
            Ver auditoría completa
          </button>
        )}
      </div>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Eventos de auditoría">
        <table>
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Origen</th>
              <th>Acción</th>
              <th>Recurso</th>
              <th>Usuario / equipo</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((entry) => (
              <tr key={entry.key}>
                <td>{new Date(entry.timestamp).toLocaleString('es-EC')}</td>
                <td>{reportingOrigins[entry.origin]}</td>
                <td>
                  <span className="pill neutral">{entry.action}</span>
                </td>
                <td>{entry.resource}</td>
                <td>
                  {entry.user}
                  <small>{entry.machine}</small>
                </td>
                <td>
                  <button
                    aria-label={`Ver evento ${entry.id}`}
                    aria-expanded={selected === entry.key}
                    onClick={() => setSelected(selected === entry.key ? undefined : entry.key)}
                  >
                    Ver detalle
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!entries.length && (
        <p className="reporting-empty">
          No hay eventos en los registros disponibles para estos filtros.
        </p>
      )}
      {!preview && (
        <nav className="reporting-pagination" aria-label="Páginas de auditoría">
          <span>
            {entries.length} eventos disponibles · Página {current + 1}
          </span>
          <button disabled={current === 0} onClick={() => setPage(current - 1)}>
            Anterior
          </button>
          <button disabled={current === last} onClick={() => setPage(current + 1)}>
            Siguiente
          </button>
        </nav>
      )}
      {detail && (
        <section className="reporting-audit-detail" aria-label="Detalle del evento">
          <div className="panel-heading">
            <h3>{detail.resource}</h3>
            <button onClick={() => setSelected(undefined)}>Cerrar detalle</button>
          </div>
          <p>Evento: {detail.id}</p>
          <p>Recurso: {detail.recordId}</p>
          <p>
            {detail.user} · {detail.machine} · {new Date(detail.timestamp).toLocaleString('es-EC')}
          </p>
          {detail.details.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>
      )}
    </section>
  );
}
