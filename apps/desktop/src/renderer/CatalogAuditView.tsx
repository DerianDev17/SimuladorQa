import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';

export function CatalogAuditView({ audit }: { audit: CatalogSnapshot['audit'] | undefined }) {
  return (
    <section className="panel audit-panel catalog-audit" aria-label="Actividad del catálogo">
      <div className="panel-heading">
        <h2>Actividad del catálogo</h2>
        <span className="pill neutral">Auditoría local</span>
      </div>
      {audit?.length ? (
        <div className="catalog-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha local</th>
                <th>Recurso</th>
                <th>Acción</th>
                <th>Ambiente</th>
                <th>Usuario</th>
              </tr>
            </thead>
            <tbody>
              {audit.slice(0, 10).map((entry) => (
                <tr key={entry.id}>
                  <td>{new Date(entry.timestamp).toLocaleString('es-EC')}</td>
                  <td>
                    {entry.resource === 'ENTITY'
                      ? 'Entidad'
                      : entry.resource === 'ATM'
                        ? 'ATM'
                        : 'Caso'}
                  </td>
                  <td>
                    {
                      { CREATED: 'Creado', UPDATED: 'Actualizado', DELETED: 'Eliminado' }[
                        entry.action
                      ]
                    }
                  </td>
                  <td>{entry.environment}</td>
                  <td>{entry.user}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="form-note">Sin cambios registrados en el catálogo.</p>
      )}
    </section>
  );
}
