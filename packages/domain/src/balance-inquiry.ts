import { isRecord } from './index';
import type { Scenario } from './index';
import { isRevision, isUuid, isUtcTimestamp } from './catalogs';
import { parseDraftRequest } from './transaction-draft';
import type { DraftRequest } from './transaction-draft';
import type { WithdrawalDetails } from './withdrawal';

export interface BalanceContextRequest {
  draft: DraftRequest;
  configurationRevision: number;
  cardReadId: string;
}
export interface BalanceExecutionRequest extends BalanceContextRequest {
  requestId: string;
}
export interface BalanceReadiness {
  ready: boolean;
  blockers: readonly { id: string; label: string }[];
  sequencesRemaining?: number;
}
// Only public terminal/verification flags. Never PIN blocks, IAD or cryptograms.
export interface BalanceDiagnostics {
  profileId: string;
  accountingDate: string;
  terminalApplicationVersion: string;
  cardApplicationVersion: string;
  tvr: string;
  cvmResult: string;
}
export function parseBalanceDiagnostics(value: unknown): BalanceDiagnostics | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 6 ||
    !isUuid(value.profileId) ||
    typeof value.accountingDate !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.accountingDate) ||
    !Number.isFinite(Date.parse(value.accountingDate)) ||
    new Date(value.accountingDate).toISOString().slice(0, 10) !== value.accountingDate ||
    typeof value.terminalApplicationVersion !== 'string' ||
    !/^[A-F0-9]{4}$/.test(value.terminalApplicationVersion) ||
    typeof value.cardApplicationVersion !== 'string' ||
    !/^[A-F0-9]{4}$/.test(value.cardApplicationVersion) ||
    typeof value.tvr !== 'string' ||
    !/^[A-F0-9]{10}$/.test(value.tvr) ||
    typeof value.cvmResult !== 'string' ||
    !/^[A-F0-9]{6}$/.test(value.cvmResult)
  )
    return undefined;
  return {
    profileId: value.profileId,
    accountingDate: value.accountingDate,
    terminalApplicationVersion: value.terminalApplicationVersion,
    cardApplicationVersion: value.cardApplicationVersion,
    tvr: value.tvr,
    cvmResult: value.cvmResult,
  };
}
export interface BalanceValue {
  accountCode: string;
  type: '01' | '02' | '91';
  currency: string;
  amount: string;
}
export type BalanceOutcome =
  | 'PENDING'
  | 'BLOCKED'
  | 'APPROVED'
  | 'NOT_APPROVED'
  | 'REQUIRES_REVIEW'
  | 'INVALID_RESPONSE'
  | 'CONNECT_TIMEOUT'
  | 'RESPONSE_TIMEOUT'
  | 'PEER_CLOSED'
  | 'TRANSPORT_ERROR'
  | 'CONTEXT_ERROR'
  | 'STORAGE_ERROR';
export interface BalanceExecution {
  requestId: string;
  runId: string;
  transactionId: string;
  environment: 'QA';
  atmId: string;
  atmRevision: number;
  configurationRevision: number;
  cardReadId: string;
  startedAt: string;
  scenario: Scenario;
  finishedAt: string | null;
  outcome: BalanceOutcome;
  frameGenerated: boolean;
  transmissionAttempted: boolean;
  bytesQueued: number;
  elapsedMs: number;
  correlation: { stan: string; rrn: string; terminalId: string } | null;
  responseCode: string | null;
  balances: readonly BalanceValue[];
  blockers: readonly { id: string; label: string }[];
  diagnostics?: BalanceDiagnostics;
  // Absent in historical balance records. Never infer this from the selected UI operation.
  withdrawal?: WithdrawalDetails;
  // Legacy manual QA decision, retained only to read existing audit records.
  qaContinuation?: { id: string; createdAt: string; agentId: string };
}

// Recognize the old representation without rewriting it or losing its audit.
function isLegacyWithdrawal91(execution: BalanceExecution): boolean {
  return (
    execution.environment === 'QA' &&
    !!execution.withdrawal &&
    execution.outcome === 'REQUIRES_REVIEW' &&
    execution.finishedAt !== null &&
    execution.responseCode === '91' &&
    execution.correlation !== null &&
    execution.transmissionAttempted &&
    execution.bytesQueued > 0
  );
}

export function hasWithdrawalQaContinuation(execution: BalanceExecution): boolean {
  const audit = execution.qaContinuation;
  return (
    isLegacyWithdrawal91(execution) &&
    isRecord(audit) &&
    Object.keys(audit).length === 3 &&
    isUuid(audit.id) &&
    isUuid(audit.agentId) &&
    isUtcTimestamp(audit.createdAt) &&
    Date.parse(audit.createdAt) >= Date.parse(execution.finishedAt!)
  );
}

export function withdrawalBlocksNewExecution(execution: BalanceExecution): boolean {
  return !!execution.withdrawal && balanceDeliveryUncertain(execution);
}

// A correlated host 91 is a completed non-approval, not a reconciliation task.
// Accept the old REQUIRES_REVIEW representation without rewriting the journal.
// This confirms the host response, not the final debit/settlement state in Core.
export function withdrawalHostNotApproved(execution: BalanceExecution): boolean {
  return (
    isLegacyWithdrawal91(execution) ||
    (execution.environment === 'QA' &&
      !!execution.withdrawal &&
      execution.outcome === 'NOT_APPROVED' &&
      execution.responseCode === '91' &&
      execution.finishedAt !== null &&
      execution.correlation !== null &&
      execution.transmissionAttempted &&
      execution.bytesQueued > 0)
  );
}

export function balanceDeliveryUncertain(execution: BalanceExecution): boolean {
  if (withdrawalHostNotApproved(execution)) return false;
  return (
    execution.outcome === 'PENDING' ||
    execution.outcome === 'REQUIRES_REVIEW' ||
    execution.outcome === 'STORAGE_ERROR' ||
    ((execution.transmissionAttempted || execution.bytesQueued > 0) &&
      !['APPROVED', 'NOT_APPROVED'].includes(execution.outcome))
  );
}

export function balanceNotTransmitted(execution: BalanceExecution): boolean {
  return (
    !balanceDeliveryUncertain(execution) &&
    !execution.transmissionAttempted &&
    execution.bytesQueued === 0 &&
    execution.finishedAt !== null &&
    ['BLOCKED', 'CONTEXT_ERROR', 'CONNECT_TIMEOUT', 'PEER_CLOSED', 'TRANSPORT_ERROR'].includes(
      execution.outcome,
    )
  );
}

export function balanceResponseConfirmed(execution: BalanceExecution): boolean {
  if (withdrawalHostNotApproved(execution)) return true;
  return (
    execution.finishedAt !== null &&
    execution.responseCode !== null &&
    ['APPROVED', 'NOT_APPROVED'].includes(execution.outcome)
  );
}

// A finished balance inquiry can leave the active form without resolving its
// unknown result. A withdrawal or an unfinished/unpersisted execution cannot.
export function canStartAfterUnconfirmedBalance(execution: BalanceExecution): boolean {
  return (
    !execution.withdrawal &&
    execution.finishedAt !== null &&
    balanceDeliveryUncertain(execution) &&
    [
      'CONNECT_TIMEOUT',
      'RESPONSE_TIMEOUT',
      'PEER_CLOSED',
      'TRANSPORT_ERROR',
      'INVALID_RESPONSE',
    ].includes(execution.outcome)
  );
}

export function parseBalanceContextRequest(value: unknown): BalanceContextRequest | undefined {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    !isRevision(value.configurationRevision) ||
    !isUuid(value.cardReadId)
  )
    return undefined;
  const draft = parseDraftRequest(value.draft);
  // This executable wire profile is limited to the received CB savings sample.
  if (
    !draft ||
    draft.environment !== 'QA' ||
    draft.transaction !== 'BALANCE' ||
    draft.account !== 'SAVINGS' ||
    draft.atmId === null ||
    draft.atmRevision === null
  )
    return undefined;
  return {
    draft,
    configurationRevision: value.configurationRevision,
    cardReadId: value.cardReadId,
  };
}
export function parseBalanceExecutionRequest(value: unknown): BalanceExecutionRequest | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 4 || !isUuid(value.requestId))
    return undefined;
  if (
    !['draft', 'configurationRevision', 'cardReadId', 'requestId'].every((key) =>
      Object.hasOwn(value, key),
    )
  )
    return undefined;
  const context = parseBalanceContextRequest({
    draft: value.draft,
    configurationRevision: value.configurationRevision,
    cardReadId: value.cardReadId,
  });
  return context ? { ...context, requestId: value.requestId } : undefined;
}
