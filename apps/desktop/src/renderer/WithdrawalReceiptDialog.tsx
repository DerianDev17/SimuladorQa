import { useEffect, useRef, useState } from 'react';
import {
  withdrawalReceiptRows,
  withdrawalFinancialNotes,
  type WithdrawalReceipt,
} from '../../../../packages/domain/src/withdrawal-receipt';
import type { DesktopClient } from './desktop-client';
import { Icon } from './Icon';

export function WithdrawalReceiptDialog({
  receipt,
  client,
  onClose,
}: {
  receipt: WithdrawalReceipt;
  client: DesktopClient;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [printing, setPrinting] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string }>();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  async function print() {
    if (lock.current) return;
    lock.current = true;
    setPrinting(true);
    setFeedback(undefined);
    try {
      const result = await client.call(
        (api) => api.printWithdrawalReceipt({ environment: 'QA', requestId: receipt.requestId }),
        125000,
        'No se confirmó la impresión. Revisa la cola de impresión antes de repetirla.',
      );
      setFeedback(
        result.ok
          ? {
              error: false,
              message:
                result.value === 'SUBMITTED'
                  ? 'Comprobante enviado a la cola de impresión.'
                  : 'Impresión cancelada. Puedes volver a imprimir el comprobante.',
            }
          : { error: true, message: result.error.message },
      );
    } finally {
      lock.current = false;
      setPrinting(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="receipt-dialog"
      aria-labelledby="receipt-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!lock.current) onClose();
      }}
    >
      <header className="receipt-dialog-heading">
        <div>
          <span className="receipt-eyebrow">COMPROBANTE LOCAL · QA</span>
          <h2 id="receipt-title">Vista previa del comprobante</h2>
        </div>
        <button className="text-button" disabled={printing} onClick={onClose}>
          Cerrar
        </button>
      </header>
      <div className="receipt-paper">
        <div className="receipt-brand">
          <strong>Coonecta</strong>
          <span>ATM Simulator</span>
        </div>
        <h3>Comprobante de retiro</h3>
        <p className="receipt-date">{new Date(receipt.timestamp).toLocaleString('es-EC')}</p>
        <dl>
          {withdrawalReceiptRows(receipt).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>{withdrawalFinancialNotes.debit}</p>
        <p>
          {receipt.balances.length
            ? withdrawalFinancialNotes.balance
            : withdrawalFinancialNotes.missingBalance}
        </p>
        <p className="receipt-footnote">{withdrawalFinancialNotes.receipt}</p>
      </div>
      {feedback && (
        <p
          className={feedback.error ? 'inline-error' : 'form-note'}
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.message}
        </p>
      )}
      <footer className="receipt-dialog-actions">
        <span>La impresión no realiza otra transacción.</span>
        <button className="primary" disabled={printing} onClick={() => void print()}>
          <Icon name="printer" size={18} />
          {printing ? 'Imprimiendo…' : 'Imprimir comprobante'}
        </button>
      </footer>
    </dialog>
  );
}
