import { isRecord } from './index';
import { isUtcTimestamp, isUuid } from './catalogs';
import { parseReversalMessages, type TransactionMessages } from './iso-message';

export function isReversalDelay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 30;
}
export interface WithdrawalReversal {
  transactionId: string;
  delaySeconds: number;
  outcome:
    | 'WAITING_WITHDRAWAL'
    | 'WAITING'
    | 'SENDING'
    | 'APPROVED'
    | 'NOT_APPROVED'
    | 'NOT_SENT'
    | 'UNCONFIRMED';
  dueAt: string | null;
  finishedAt: string | null;
  responseCode: string | null;
  transmissionAttempted: boolean;
  bytesQueued: number;
  messages?: TransactionMessages;
}
export type ReversalProgress = Omit<WithdrawalReversal, 'transactionId' | 'delaySeconds'>;
export function parseWithdrawalReversal(value: unknown): WithdrawalReversal | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== (Object.hasOwn(value, 'messages') ? 9 : 8) ||
    (Object.hasOwn(value, 'messages') && !parseReversalMessages(value.messages)) ||
    !isUuid(value.transactionId) ||
    !isReversalDelay(value.delaySeconds) ||
    ![
      'WAITING_WITHDRAWAL',
      'WAITING',
      'SENDING',
      'APPROVED',
      'NOT_APPROVED',
      'NOT_SENT',
      'UNCONFIRMED',
    ].includes(String(value.outcome)) ||
    !(value.dueAt === null || isUtcTimestamp(value.dueAt)) ||
    !(value.finishedAt === null || isUtcTimestamp(value.finishedAt)) ||
    !(
      value.responseCode === null ||
      (typeof value.responseCode === 'string' && /^\d{2}$/.test(value.responseCode))
    ) ||
    typeof value.transmissionAttempted !== 'boolean' ||
    typeof value.bytesQueued !== 'number' ||
    !Number.isSafeInteger(value.bytesQueued) ||
    value.bytesQueued < 0
  )
    return undefined;
  const r = value as unknown as WithdrawalReversal;
  const pending = ['WAITING_WITHDRAWAL', 'WAITING', 'SENDING'].includes(r.outcome);
  if (
    pending !== (r.finishedAt === null) ||
    (['WAITING', 'SENDING', 'APPROVED', 'NOT_APPROVED'].includes(r.outcome) && !r.dueAt) ||
    (['WAITING_WITHDRAWAL', 'WAITING', 'NOT_SENT'].includes(r.outcome) &&
      (r.transmissionAttempted || r.bytesQueued !== 0)) ||
    (['SENDING', 'UNCONFIRMED'].includes(r.outcome) && !r.transmissionAttempted) ||
    (['APPROVED', 'NOT_APPROVED'].includes(r.outcome) &&
      (!r.transmissionAttempted || !r.bytesQueued || r.responseCode === null)) ||
    (r.outcome === 'APPROVED' && r.responseCode !== '00') ||
    (r.outcome === 'NOT_APPROVED' && r.responseCode === '00') ||
    (!['APPROVED', 'NOT_APPROVED'].includes(r.outcome) && r.responseCode !== null)
  )
    return undefined;
  return { ...r };
}

export const reversalOutcomeLabels: Record<WithdrawalReversal['outcome'], string> = {
  WAITING_WITHDRAWAL: 'Esperando aprobación del retiro',
  WAITING: 'Reverso programado',
  SENDING: 'Reverso enviado · esperando respuesta',
  APPROVED: 'Reverso aceptado por el host',
  NOT_APPROVED: 'Reverso no aprobado por el host',
  NOT_SENT: 'Reverso no enviado',
  UNCONFIRMED: 'Reverso sin respuesta confirmada',
};
