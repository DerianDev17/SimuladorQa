import { accountTypes } from '../../../../packages/domain/src/transaction-draft';
import { CaptureEvidenceView } from './CaptureEvidenceView';
import { Icon } from './Icon';
import type { AppSnapshot } from '../../../../packages/shared/src/contracts';
import type { TransactionType } from '../../../../packages/domain/src/index';
import type { CaptureEvidence } from '../../../../packages/domain/src/capture-evidence';
export function TransactionDocumentation({
  original,
  operation,
  transaction,
  captureEvidence,
}: {
  original: boolean;
  operation: AppSnapshot['documentedOperations'][number] | undefined;
  transaction: TransactionType;
  captureEvidence: CaptureEvidence | null | undefined;
}) {
  return (
    <div className="transaction-documentation-details" aria-label="Documentación y capturas">
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
                    <dt>
                      {transaction === 'DEPOSIT' ? 'Código de procesamiento F3' : 'TrnCode CMS'}
                    </dt>
                    <dd className="documented-code">{operation.code}</dd>
                  </div>
                  <div>
                    <dt>
                      {transaction === 'DEPOSIT' ? 'Cuenta de prueba QA' : 'Tipo de cuenta CMS'}
                    </dt>
                    <dd>
                      {operation.accountCode} ·{' '}
                      {accountTypes.find((item) => item.id === operation.account)?.label}
                    </dd>
                  </div>
                </dl>
                <p>
                  {operation.source.title} v{operation.source.version} · p. {operation.source.page};
                  {transaction === 'DEPOSIT'
                    ? 'Configuración de prueba QA solicitada por el operador.'
                    : 'cuenta p. 17.'}
                </p>
                <small>
                  {transaction === 'DEPOSIT'
                    ? 'La trama de referencia recibió RC 12. La prueba requiere validar el resultado con el host.'
                    : 'Referencia del catálogo CMS; no sustituye el contrato del mensaje ATM ni acredita el resultado financiero.'}
                </small>
                <details className="inline-details">
                  <summary>Consultar referencia</summary>
                  <p>
                    {operation.source.title} · versión {operation.source.version}, página{' '}
                    {operation.source.page}.{' '}
                    {transaction === 'DEPOSIT'
                      ? 'Ahorros/USD confirmados por el operador.'
                      : 'La cuenta se documenta en la página 17.'}
                  </p>
                  <p>
                    {transaction === 'DEPOSIT'
                      ? 'La transcripción sanitizada y sus límites están documentados en docs/transactions/DEPOSIT.md.'
                      : 'El documento original no está adjunto a esta vista. Se conserva la referencia aprobada del catálogo.'}
                  </p>
                </details>
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
    </div>
  );
}
