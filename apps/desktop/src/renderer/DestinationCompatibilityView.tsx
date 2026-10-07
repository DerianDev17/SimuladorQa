import type { DestinationCompatibility } from '../../../../packages/domain/src/destination-compatibility';

export function DestinationCompatibilityView({ report }: { report: DestinationCompatibility }) {
  return (
    <section className="destination-compatibility" aria-label="Compatibilidad del destino">
      <h3>Compatibilidad del destino</h3>
      <p>
        {report.source.title} · inspeccionado{' '}
        <time dateTime={report.source.inspectedAt}>
          {new Date(report.source.inspectedAt).toLocaleString('es-EC')}
        </time>
      </p>
      <ul>
        {report.checks.map((check) => (
          <li key={check.id}>
            <span className={`compatibility-mark ${check.status.toLowerCase()}`}>
              {check.status === 'MATCH' ? '✓' : check.status === 'MISMATCH' ? '!' : '○'}
            </span>
            <div>
              <strong>
                {check.label} ·{' '}
                {check.status === 'MATCH'
                  ? 'Longitud compatible'
                  : check.status === 'MISMATCH'
                    ? 'Incompatible'
                    : 'Pendiente'}
              </strong>
              <p>{check.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <small>
        Evidencia del esquema guardada. No comprueba conexión actual, registros configurados ni
        autorización de envío.
      </small>
    </section>
  );
}
