import { isRecord } from './index';
import { isRevision, isUuid } from './catalogs';
import { parseDraftRequest } from './transaction-draft';
import { isWithdrawalAmount } from './withdrawal';
import { balanceDeliveryUncertain } from './balance-inquiry';
import type {
  BalanceContextRequest,
  BalanceExecution,
  BalanceExecutionRequest,
  BalanceReadiness,
} from './balance-inquiry';

export interface DepositDetails {
  transaction: 'DEPOSIT';
  account: 'SAVINGS';
  currency: '840';
  amount: string;
}

// Same technical F4 encoding limit, not a withdrawal or deposit business rule.
export function parseDepositDetails(value: unknown): DepositDetails | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    value.transaction !== 'DEPOSIT' ||
    value.account !== 'SAVINGS' ||
    value.currency !== '840' ||
    !isWithdrawalAmount(value.amount)
  )
    return undefined;
  return { transaction: 'DEPOSIT', account: 'SAVINGS', currency: '840', amount: value.amount };
}

export function parseDepositContextRequest(value: unknown): BalanceContextRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !isRevision(value.configurationRevision) ||
    !isUuid(value.cardReadId)
  )
    return undefined;
  const draft = parseDraftRequest(value.draft);
  if (
    !draft ||
    draft.environment !== 'QA' ||
    draft.scenario !== 'LOCAL' ||
    draft.transaction !== 'DEPOSIT' ||
    draft.account !== 'SAVINGS' ||
    draft.atmId === null ||
    draft.atmRevision === null ||
    !isWithdrawalAmount(draft.amount)
  )
    return undefined;
  return {
    draft,
    configurationRevision: value.configurationRevision,
    cardReadId: value.cardReadId,
  };
}

export function parseDepositExecutionRequest(value: unknown): BalanceExecutionRequest | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 4 || !isUuid(value.requestId))
    return undefined;
  const context = parseDepositContextRequest({
    draft: value.draft,
    configurationRevision: value.configurationRevision,
    cardReadId: value.cardReadId,
  });
  return context ? { ...context, requestId: value.requestId } : undefined;
}

// Deposit has no approved continuation/reversal policy for uncertain delivery.
// Do not borrow the separate QA withdrawal continuation exception.
export function depositBlocksNewExecution(execution: BalanceExecution): boolean {
  return (
    !!execution.deposit && (execution.finishedAt === null || balanceDeliveryUncertain(execution))
  );
}

export const missingDepositContext: BalanceReadiness = {
  ready: false,
  blockers: [
    {
      id: 'QA-DEPOSIT-CONTEXT',
      label: 'Falta un contexto QA de depósito con perfil ATM, tarjeta y seguridad nueva',
    },
  ],
};
