import type { BalanceExecution, BalanceValue } from './balance-inquiry';

export type ReceiptPreference = 'WITHOUT_PRINT' | 'WITH_PRINT';
export type ReceiptPrintStatus = 'SUBMITTED' | 'CANCELLED';
export interface WithdrawalReceiptRequest {
  environment: 'QA';
  requestId: string;
}
export interface WithdrawalReceipt {
  requestId: string;
  transactionId: string;
  runId: string;
  timestamp: string;
  terminalId: string;
  stan: string;
  rrn: string;
  amount: string;
  balances: readonly BalanceValue[];
}

export function hostMoney(currency: string, amount: string): string {
  return `${currency === '840' ? 'USD' : currency} ${amount}`;
}

// An authorization is not a Core ledger entry. F54 types deliberately retain
// their source labels until BALANCE-RESPONSE-CONTRACT is validated per profile.
export const withdrawalFinancialNotes = {
  debit: 'El host autoriza el retiro; el débito total y las comisiones no están informados.',
  balance: 'Falta identificar cuál saldo del host corresponde al disponible después del retiro.',
  missingBalance: 'El host no devolvió saldos en esta respuesta.',
  receipt: 'Comprobante local de simulación QA. No acredita entrega de efectivo ni débito en Core.',
} as const;

export function createWithdrawalReceipt(execution: BalanceExecution): WithdrawalReceipt | null {
  if (
    !execution.withdrawal ||
    execution.environment !== 'QA' ||
    execution.outcome !== 'APPROVED' ||
    execution.responseCode !== '00' ||
    !execution.finishedAt ||
    !execution.transmissionAttempted ||
    !execution.correlation
  )
    return null;
  return {
    requestId: execution.requestId,
    transactionId: execution.transactionId,
    runId: execution.runId,
    timestamp: execution.finishedAt,
    terminalId: execution.correlation.terminalId,
    stan: execution.correlation.stan,
    rrn: execution.correlation.rrn,
    amount: hostMoney(execution.withdrawal.currency, execution.withdrawal.amount),
    balances: execution.balances.map(({ accountCode, type, currency, amount }) => ({
      accountCode,
      type,
      currency,
      amount,
    })),
  };
}

export function withdrawalReceiptRows(receipt: WithdrawalReceipt): readonly [string, string][] {
  return [
    ['Estado', 'Retiro autorizado por el host · 00'],
    ['Cuenta', 'Ahorros'],
    ['Monto autorizado', receipt.amount],
    ['Débito total', 'No confirmado'],
    ['Saldo restante', receipt.balances.length ? 'Sin identificar' : 'No informado'],
    ...receipt.balances.map((balance): [string, string] => [
      `Saldo recibido · tipo ${balance.type} · cuenta ${balance.accountCode}`,
      hostMoney(balance.currency, balance.amount),
    ]),
    ['Terminal', receipt.terminalId],
    ['STAN', receipt.stan],
    ['RRN', receipt.rrn],
    ['Transacción', receipt.transactionId],
    ['Ejecución', receipt.runId],
  ];
}
