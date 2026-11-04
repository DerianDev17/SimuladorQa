import { accountTypes } from '../../../../packages/domain/src/transaction-draft';
import { CaptureEvidenceView } from './CaptureEvidenceView';
import { Icon } from './Icon';
import type { TransactionPreparation } from './useTransactionPreparation';
export function TransactionDocumentation({ preparation }: { preparation: TransactionPreparation }) {
  const { original, operation, transaction, snapshot } = preparation;
  return (
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
                  {operation.source.title} v{operation.source.version} · p. {operation.source.page};
                  cuenta p. 17.
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
        {snapshot?.captureEvidence && (
          <section className="panel transaction-captures-panel">
            <CaptureEvidenceView report={snapshot.captureEvidence} />
          </section>
        )}
      </div>
    </details>
  );
}
