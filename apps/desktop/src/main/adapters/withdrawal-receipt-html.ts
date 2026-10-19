import {
  withdrawalReceiptRows,
  withdrawalFinancialNotes,
  type WithdrawalReceipt,
} from '../../../../../packages/domain/src/withdrawal-receipt';

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );
}

export function withdrawalReceiptHtml(receipt: WithdrawalReceipt): string {
  const rows = [['Fecha UTC', receipt.timestamp], ...withdrawalReceiptRows(receipt)];
  return `<!doctype html><html lang="es"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Comprobante de retiro QA</title><style>
@page { size: A4; margin: 18mm; }
body { font: 12px Arial, sans-serif; color: #17283e; max-width: 560px; margin: 0 auto; }
header { border-bottom: 2px solid #17283e; padding-bottom: 16px; margin-bottom: 18px; }
h1 { font-size: 22px; margin-bottom: 6px; } p { line-height: 1.5; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { padding: 9px 0; border-bottom: 1px solid #dce4ee; text-align: left; overflow-wrap: anywhere; }
th { width: 47%; font-weight: 400; } td { font-weight: 600; }
footer { margin-top: 20px; font-size: 11px; } tr { break-inside: avoid; }
</style></head><body><header><b>COONECTA · ATM Simulator</b>
<h1>Comprobante de retiro</h1><span>Ambiente QA · Simulación</span></header>
<table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label!)}</th><td>${escapeHtml(value!)}</td></tr>`).join('')}</table>
<footer><p>${escapeHtml(withdrawalFinancialNotes.debit)}</p>
<p>${escapeHtml(receipt.balances.length ? withdrawalFinancialNotes.balance : withdrawalFinancialNotes.missingBalance)}</p>
<p>${escapeHtml(withdrawalFinancialNotes.receipt)}</p></footer></body></html>`;
}
