import type { BalanceExecution } from '../../../../packages/domain/src/balance-inquiry';
import {
  balanceDeliveryUncertain,
  canStartAfterUnconfirmedBalance,
  canStartAfterUnconfirmedWithdrawal,
  hasWithdrawalQaContinuation,
  withdrawalHostNotApproved,
} from '../../../../packages/domain/src/balance-inquiry';
import './balance-execution.css';
import {
  createWithdrawalReceipt,
  hostMoney,
  withdrawalFinancialNotes,
} from '../../../../packages/domain/src/withdrawal-receipt';
import { Icon } from './Icon';
import { useEffect, useState } from 'react';
import { reversalOutcomeLabels } from '../../../../packages/domain/src/withdrawal-reversal';

export const balanceOutcomeLabels: Record<BalanceExecution['outcome'], string> = {
  PENDING: 'Resultado pendiente',
  BLOCKED: 'Consulta bloqueada',
  APPROVED: 'Consulta aprobada',
  NOT_APPROVED: 'Consulta no aprobada',
  REQUIRES_REVIEW: 'Respuesta del host por revisar',
  INVALID_RESPONSE: 'Respuesta inválida',
  CONNECT_TIMEOUT: 'Conexión sin respuesta',
  RESPONSE_TIMEOUT: 'Sin respuesta financiera dentro del plazo',
  PEER_CLOSED: 'El destino cerró la conexión',
  TRANSPORT_ERROR: 'Error de comunicación',
  CONTEXT_ERROR: 'Contexto QA no disponible',
  STORAGE_ERROR: 'Resultado sin guardar',
};
export function executionOutcomeLabel(execution: BalanceExecution): string {
  if (execution.reversal && execution.outcome === 'APPROVED')
    return reversalOutcomeLabels[execution.reversal.outcome];
  if (withdrawalHostNotApproved(execution)) return 'Retiro no aprobado';
  if (execution.withdrawal) {
    if (execution.outcome === 'APPROVED') return 'Retiro autorizado por el host';
    if (execution.outcome === 'BLOCKED') return 'Retiro bloqueado';
    if (execution.outcome === 'NOT_APPROVED') return 'Retiro no aprobado';
  }
  return balanceOutcomeLabels[execution.outcome];
}
export function BalanceExecutionView({
  execution,
  onReceipt,
}: {
  execution: BalanceExecution;
  onReceipt?: (execution: BalanceExecution) => void;
}) {
  const approved = execution.outcome === 'APPROVED';
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (execution.reversal?.outcome !== 'WAITING') return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [execution.reversal?.outcome]);
  const fullyApproved =
    approved && (!execution.reversal || execution.reversal.outcome === 'APPROVED');
  return (
    <div
      className={`preparation balance-execution ${fullyApproved ? 'balance-approved' : ''}`}
      role="status"
      aria-label={execution.withdrawal ? 'Resultado de retiro' : 'Resultado de consulta de saldo'}
    >
      <div className={`execution-status ${fullyApproved ? 'is-approved' : ''}`}>
        <span className="execution-status-icon">
          <Icon name={fullyApproved ? 'check' : 'clock'} size={23} />
        </span>
        <div>
          <strong>{executionOutcomeLabel(execution)}</strong>
          <span>{execution.withdrawal ? 'Retiro · Ahorros' : 'Consulta de saldo'} · QA</span>
        </div>
        {execution.responseCode && (
          <span className="execution-response-code">RC {execution.responseCode}</span>
        )}
      </div>
      {execution.reversal && (
        <section className="reversal-progress" aria-label="Flujo de retiro y reverso">
          <ol>
            <li>
              <strong>1. Retiro</strong>
              <span>{approved ? 'Aprobado · 00' : balanceOutcomeLabels[execution.outcome]}</span>
            </li>
            <li>
              <strong>2. Espera</strong>
              <span>
                {execution.reversal.outcome === 'WAITING' && execution.reversal.dueAt
                  ? `${Math.max(0, Math.ceil((Date.parse(execution.reversal.dueAt) - now) / 1000))} s para enviar el reverso`
                  : `${execution.reversal.delaySeconds} s después de la aprobación`}
              </span>
            </li>
            <li>
              <strong>3. Reverso</strong>
              <span>
                {reversalOutcomeLabels[execution.reversal.outcome]}
                {execution.reversal.responseCode ? ` · ${execution.reversal.responseCode}` : ''}
              </span>
            </li>
          </ol>
          {execution.reversal.outcome === 'APPROVED' && (
            <p>
              El host aceptó el reverso. El saldo final debe verificarse con una nueva consulta.
            </p>
          )}
          {['NOT_SENT', 'NOT_APPROVED', 'UNCONFIRMED'].includes(execution.reversal.outcome) &&
            approved && (
              <p>
                El retiro fue aprobado y el reverso no está confirmado. Conserva ambas referencias
                para revisar en el host.
              </p>
            )}
          <small>Referencia del reverso: {execution.reversal.transactionId}</small>
        </section>
      )}
      {execution.withdrawal && (
        <>
          <p className="execution-requested">
            Monto solicitado: USD {execution.withdrawal.amount} · Ahorros
          </p>
          <dl className="withdrawal-amounts" aria-label="Importes del retiro">
            <div className="withdrawal-authorized">
              <dt>Monto autorizado</dt>
              <dd>
                {approved
                  ? hostMoney(execution.withdrawal.currency, execution.withdrawal.amount)
                  : 'Sin confirmar'}
              </dd>
              <small>
                {approved ? 'Respuesta aprobada del host' : 'No hay autorización completa'}
              </small>
            </div>
            <div>
              <dt>Débito total</dt>
              <dd className="amount-unavailable">No confirmado</dd>
            </div>
            <div>
              <dt>Saldo restante</dt>
              <dd className="amount-unavailable">
                {approved
                  ? execution.balances.length
                    ? 'Sin identificar'
                    : 'No informado'
                  : 'Sin confirmar'}
              </dd>
            </div>
          </dl>
          {approved && <p className="execution-note">{withdrawalFinancialNotes.debit}</p>}
        </>
      )}
      {execution.outcome === 'REQUIRES_REVIEW' && !withdrawalHostNotApproved(execution) && (
        <p>
          La respuesta no confirma una autorización completa por el monto solicitado. Revisa su
          detalle técnico.
        </p>
      )}
      {withdrawalHostNotApproved(execution) && (
        <p>
          El emisor o el switch no está operativo (91). Puedes preparar una nueva operación con otra
          lectura de tarjeta y PIN.
        </p>
      )}
      {execution.outcome === 'NOT_APPROVED' && !withdrawalHostNotApproved(execution) && (
        <p>
          El host respondió sin aprobar {execution.withdrawal ? 'el retiro' : 'la consulta'}. El
          motivo interno requiere correlación con Switch/Core.
        </p>
      )}
      {approved && (
        <section className="host-balances" aria-label="Saldos recibidos">
          <h3>
            {execution.reversal
              ? 'Saldos del retiro, anteriores al reverso'
              : 'Saldos devueltos por el host'}
          </h3>
          {execution.balances.length ? (
            <dl>
              {execution.balances.map((balance) => (
                <div key={`${balance.accountCode}/${balance.type}/${balance.currency}`}>
                  <dt>
                    Saldo recibido · tipo {balance.type}
                    <small>Cuenta {balance.accountCode}</small>
                  </dt>
                  <dd>{hostMoney(balance.currency, balance.amount)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{withdrawalFinancialNotes.missingBalance}</p>
          )}
          {execution.withdrawal && execution.balances.length > 0 && (
            <p className="execution-note">{withdrawalFinancialNotes.balance}</p>
          )}
        </section>
      )}
      {execution.blockers.length > 0 && (
        <ul>
          {execution.blockers.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
      )}
      {balanceDeliveryUncertain(execution) ? (
        <p>
          {canStartAfterUnconfirmedWithdrawal(execution)
            ? 'El retiro terminó con resultado por revisar y conserva su referencia. Puedes iniciar una nueva transacción QA con otra lectura de tarjeta y PIN.'
            : canStartAfterUnconfirmedBalance(execution)
              ? 'La consulta terminó sin respuesta confirmada. Conserva la referencia para correlación.'
              : 'La entrega o el resultado financiero no están confirmados. No repitas el envío; conserva la referencia para correlación.'}
        </p>
      ) : !approved ? (
        <p>
          {execution.transmissionAttempted
            ? execution.outcome === 'APPROVED' ||
              execution.outcome === 'NOT_APPROVED' ||
              withdrawalHostNotApproved(execution)
              ? 'Respuesta del host recibida.'
              : 'Intento registrado.'
            : execution.withdrawal
              ? 'No se transmitió el retiro.'
              : 'No se transmitió la consulta.'}
        </p>
      ) : null}
      {execution.correlation && (
        <dl className="execution-correlation">
          <div>
            <dt>STAN</dt>
            <dd>{execution.correlation.stan}</dd>
          </div>
          <div>
            <dt>RRN</dt>
            <dd>{execution.correlation.rrn}</dd>
          </div>
          <div>
            <dt>Tiempo de respuesta</dt>
            <dd>{execution.elapsedMs} ms</dd>
          </div>
        </dl>
      )}
      {onReceipt && createWithdrawalReceipt(execution) && (
        <button className="secondary receipt-preview-button" onClick={() => onReceipt(execution)}>
          <Icon name="printer" size={17} /> Ver comprobante
        </button>
      )}
      <details className="inline-details">
        <summary>Referencia de ejecución</summary>
        {execution.responseCode && <p>Código de respuesta: {execution.responseCode}</p>}
        <p>
          Transacción {execution.transactionId} · ejecución {execution.runId}
        </p>
        <p>Referencia de solicitud {execution.requestId}</p>
        {hasWithdrawalQaContinuation(execution) && execution.qaContinuation && (
          <p>
            Decisión QA anterior {execution.qaContinuation.id} ·{' '}
            {new Date(execution.qaContinuation.createdAt).toLocaleString('es-EC')}
          </p>
        )}
        {execution.correlation && (
          <p>
            Terminal {execution.correlation.terminalId} · STAN {execution.correlation.stan} · RRN{' '}
            {execution.correlation.rrn}
          </p>
        )}
        <p>
          {new Date(execution.startedAt).toLocaleString('es-EC')} · Transporte:{' '}
          {execution.elapsedMs} ms
        </p>
        {execution.finishedAt && (
          <p>
            Duración total, incluida preparación:{' '}
            {Math.max(0, Date.parse(execution.finishedAt) - Date.parse(execution.startedAt))} ms
          </p>
        )}
        {execution.diagnostics && (
          <>
            <p>Fecha ISO enviada (F15): {execution.diagnostics.accountingDate}</p>
            <p>
              Versión terminal: {execution.diagnostics.terminalApplicationVersion} · versión chip:{' '}
              {execution.diagnostics.cardApplicationVersion}
            </p>
            <p>
              TVR: {execution.diagnostics.tvr} · CVM: {execution.diagnostics.cvmResult}
            </p>
            {execution.diagnostics.terminalApplicationVersion !==
              execution.diagnostics.cardApplicationVersion && (
              <p>Las versiones EMV difieren; validar el perfil aprobado antes de modificarlas.</p>
            )}
            {execution.diagnostics.cvmResult.endsWith('01') && (
              <p>
                EMV informó verificación del titular no satisfactoria. El ingreso del PIN no
                sustituye ese resultado.
              </p>
            )}
          </>
        )}
        {execution.outcome === 'NOT_APPROVED' && !execution.diagnostics && (
          <p>Este registro anterior no contiene el diagnóstico EMV de la operación.</p>
        )}
      </details>
    </div>
  );
}
