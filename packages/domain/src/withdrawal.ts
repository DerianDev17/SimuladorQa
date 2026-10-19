import { isRecord } from './index';
import { isRevision, isUuid } from './catalogs';
import { parseDraftRequest } from './transaction-draft';
import { isReversalDelay } from './withdrawal-reversal';
import type {
  BalanceContextRequest,
  BalanceExecutionRequest,
  BalanceReadiness,
} from './balance-inquiry';

export interface WithdrawalDetails {
  transaction: 'WITHDRAWAL_APPROVED' | 'WITHDRAWAL_DECLINED';
  account: 'SAVINGS';
  currency: '840';
  amount: string;
}

// Encoding limit of ISOBASEI F4, not an issuer limit or denomination rule.
export function isWithdrawalAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,9})\.\d{2}$/.test(value) && value !== '0.00';
}

export function parseWithdrawalDetails(value: unknown): WithdrawalDetails | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 4 ||
    (value.transaction !== 'WITHDRAWAL_APPROVED' && value.transaction !== 'WITHDRAWAL_DECLINED') ||
    value.account !== 'SAVINGS' ||
    value.currency !== '840' ||
    !isWithdrawalAmount(value.amount)
  )
    return undefined;
  return {
    transaction: value.transaction,
    account: 'SAVINGS',
    currency: '840',
    amount: value.amount,
  };
}

export function parseWithdrawalContextRequest(value: unknown): BalanceContextRequest | undefined {
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
    !['WITHDRAWAL_APPROVED', 'WITHDRAWAL_DECLINED'].includes(draft.transaction) ||
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

export function parseWithdrawalExecutionRequest(
  value: unknown,
): BalanceExecutionRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== (Object.hasOwn(value, 'reversalDelaySeconds') ? 5 : 4) ||
    !isUuid(value.requestId) ||
    (Object.hasOwn(value, 'reversalDelaySeconds') && !isReversalDelay(value.reversalDelaySeconds))
  )
    return undefined;
  const context = parseWithdrawalContextRequest({
    draft: value.draft,
    configurationRevision: value.configurationRevision,
    cardReadId: value.cardReadId,
  });
  if (
    !context ||
    (value.reversalDelaySeconds !== undefined &&
      context.draft.transaction !== 'WITHDRAWAL_APPROVED')
  )
    return undefined;
  return {
    ...context,
    requestId: value.requestId,
    ...(value.reversalDelaySeconds !== undefined
      ? { reversalDelaySeconds: value.reversalDelaySeconds as number }
      : {}),
  };
}

// This information is public. Only Main can bind the approved security provider.
export const missingWithdrawalContext: BalanceReadiness = {
  ready: false,
  blockers: [
    {
      id: 'QA-WITHDRAWAL-EMV-GENERATION',
      label: 'Falta validar el perfil EMV de retiro con el proveedor (9F02, 9C y CDOL1)',
    },
    {
      id: 'AMOUNT-RULES',
      label: 'Falta validar los límites y denominaciones de retiro para este perfil',
    },
    {
      id: 'QA-WITHDRAWAL-RESULT-RULES',
      label: 'Falta validar el tratamiento de respuestas parciales, rechazos y reversos',
    },
  ],
};
