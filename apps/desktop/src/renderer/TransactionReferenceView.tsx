import type { TransactionType } from '../../../../packages/domain/src/index';
import { accountTypes } from '../../../../packages/domain/src/transaction-draft';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import { Icon } from './Icon';
import { CaptureEvidenceView } from './CaptureEvidenceView';

export function TransactionReferenceView({
  hasExecution,
  hasAtm,
  original,
  transaction,
  operation,
  captureEvidence,
}: {
  hasExecution: boolean;
  hasAtm: boolean;
  original: boolean;
  transaction: TransactionType;
  operation: AppSnapshot['documentedOperations'][number] | undefined;
  captureEvidence: AppSnapshot['captureEvidence'] | undefined;
}) {
  return (
    <>
      <details className="section-details transaction-execution-details" hidden={hasExecution}>
        <summary>
          Flujo e inspector <span>Vista documental</span>
        </summary>
        <div className="execution-details-grid">
          <section className="panel transaction-flow" aria-labelledby="transaction-flow-title">
            <div className="panel-heading">
              <h2 id="transaction-flow-title">Flujo de transacción</h2>
              <span className="pill neutral">Sin ejecución</span>
            </div>
            <ol className="transaction-route">
              {[
                {
                  icon: 'atm' as const,
                  title: 'ATM Simulator',
                  text: hasAtm ? 'Perfil en borrador, sin envío' : 'Selecciona un perfil ATM',
                },
                {
                  icon: 'monitor' as const,
                  title: 'Switch Coonecta (SmartVista)',
                  text: 'Conexión sin configurar',
                },
                { icon: 'database' as const, title: 'Core', text: 'Observador sin configurar' },
                {
                  icon: 'transaction' as const,
                  title: 'Respuesta del Switch',
                  text: 'Sin mensaje recibido',
                },
              ].map((step) => (
                <li key={step.title}>
                  <span className="route-icon">
                    <Icon name={step.icon} size={21} />
                  </span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </div>
                  <span className="route-time">—</span>
                </li>
              ))}
            </ol>
            <div className="transaction-result-placeholder">
              <Icon name="clock" size={23} />
              <div>
                <strong>Resultado pendiente</strong>
              </div>
            </div>
            <dl className="transaction-result-values">
              <div>
                <dt>Código de respuesta</dt>
                <dd>—</dd>
              </div>
              <div>
                <dt>Monto ejecutado</dt>
                <dd>—</dd>
              </div>
            </dl>
          </section>
          <section
            className="panel transaction-inspector"
            aria-labelledby="transaction-inspector-title"
          >
            <div className="panel-heading">
              <h2 id="transaction-inspector-title">Mensaje ISO8583</h2>
              <label className="inspector-view-picker">
                <span className="visually-hidden">Vista del mensaje</span>
                <select aria-label="Vista del mensaje" disabled>
                  <option>Vista: Campos</option>
                </select>
              </label>
            </div>
            <div className="inspector-tabs" role="tablist" aria-label="Vistas de evidencia">
              <button role="tab" aria-selected="false" disabled>
                Solicitud
              </button>
              <button role="tab" aria-selected="false" disabled>
                Respuesta
              </button>
              <button role="tab" aria-selected="false" disabled>
                RAW
              </button>
              <button role="tab" aria-selected="false" disabled>
                HEX
              </button>
            </div>
            <table className="inspector-table" aria-label="Campos del mensaje">
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Descripción</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={3}>
                    <div className="empty-state compact">
                      <Icon name="transaction" size={32} />
                      <h3>Esperando una ejecución</h3>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="inspector-footnote">
              <Icon name="shield" size={14} /> Sin mensaje · datos sensibles protegidos
            </p>
          </section>{' '}
        </div>
      </details>
      <details className="section-details transaction-documentation-details">
        <summary>Documentación y capturas</summary>
        <div className="transaction-support-grid">
          <section
            className="panel transaction-reference-panel"
            aria-label="Documentación de la operación"
          >
            {' '}
            <div className="documented-operation" aria-label="Referencia documental">
              <span className="eyebrow">REFERENCIA DOCUMENTAL</span>
              <h3>{original ? 'Reverso asociado al original' : 'Catálogo de la operación'}</h3>
              {operation ? (
                <>
                  <dl>
                    <div>
                      <dt>TrnCode CMS</dt>
                      <dd className="documented-code">{operation.code}</dd>
                    </div>
                    <div>
                      <dt>Tipo de cuenta CMS</dt>
                      <dd>
                        {operation.accountCode} ·{' '}
                        {accountTypes.find((item) => item.id === operation.account)?.label}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    {operation.source.title} v{operation.source.version} · p.{' '}
                    {operation.source.page}; cuenta p. 17.
                  </p>
                  <small>
                    Referencia CMS. El formato del mensaje ATM sigue pendiente de validación.
                  </small>
                </>
              ) : (
                <p>
                  {original
                    ? 'Requiere el mensaje original, la familia MTI y los campos de correlación aprobados.'
                    : 'El catálogo documental no está disponible para esta selección.'}
                </p>
              )}
            </div>
            {original && (
              <div className="document-note">
                <Icon name="shield" size={19} />
                <p>
                  {transaction === 'TIMEOUT_REVERSAL'
                    ? 'Timeout, duplicados y respuesta tardía: reglas operativas pendientes.'
                    : 'El código y la cuenta se resolverán desde la transacción original validada.'}
                </p>
              </div>
            )}
          </section>
          {captureEvidence && (
            <section className="panel transaction-captures-panel">
              <CaptureEvidenceView report={captureEvidence} />
            </section>
          )}
        </div>
      </details>
    </>
  );
}
