import { isUuid } from './catalogs';
import { isRecord } from './index';

export type LoadTestOperation = 'BALANCE';
export type LoadTestMode = 'LOAD' | 'STRESS';

// Temporary local ceiling reported by the user for the QA switch. This does
// not represent a vendor-approved capacity or authorize a run by itself.
export const LOAD_TEST_LOCAL_MAX_TPS = 5;
export const LOAD_TEST_LOCAL_MIN_TPS = 0.1;

export interface LoadTestDraft {
  environment: 'QA';
  mode: LoadTestMode;
  operation: LoadTestOperation;
  atmId: string;
  atmRevision: number;
  // The original fields remain readable for existing single-ATM runs.
  additionalAtms?: readonly LoadTestAtm[];
  maxTransactions: number;
  targetTps: number;
  concurrency: number;
  rampUpSeconds: number;
  durationSeconds: number;
}

export interface LoadTestAtm {
  atmId: string;
  atmRevision: number;
}

export function loadTestAtms(draft: LoadTestDraft): LoadTestAtm[] {
  return [
    { atmId: draft.atmId, atmRevision: draft.atmRevision },
    ...(draft.additionalAtms ?? []).map((atm) => ({ ...atm })),
  ];
}

export function loadTargetTps(plan: LoadTestDraft, elapsedMs: number): number {
  return plan.mode === 'STRESS'
    ? Math.max(
        Math.min(1, plan.targetTps),
        plan.targetTps * Math.min(1, Math.max(0, elapsedMs) / (plan.rampUpSeconds * 1000)),
      )
    : plan.targetTps;
}

export interface LoadTestPlan {
  planId: string;
  createdAt: string;
  draft: LoadTestDraft;
  status: 'BLOCKED_EXECUTION';
  blockers: readonly {
    id: 'LOAD_LIMITS_NOT_APPROVED' | 'QA_CARD_SOURCE_NOT_READY' | 'LOAD_EXECUTOR_NOT_IMPLEMENTED';
    label: string;
  }[];
  frameGenerated: false;
  transmissionAttempted: false;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseLoadTestDraft(value: unknown): LoadTestDraft | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return;
  const request = value as Record<string, unknown>;
  const keys = [
    'environment',
    'mode',
    'operation',
    'atmId',
    'atmRevision',
    'maxTransactions',
    'targetTps',
    'concurrency',
    'rampUpSeconds',
    'durationSeconds',
    ...(Object.hasOwn(request, 'additionalAtms') ? ['additionalAtms'] : []),
  ];
  if (
    Object.keys(request).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(request, key)) ||
    request.environment !== 'QA' ||
    !['LOAD', 'STRESS'].includes(request.mode as string) ||
    request.operation !== 'BALANCE' ||
    !isUuid(request.atmId) ||
    !positiveInteger(request.atmRevision) ||
    !positiveInteger(request.maxTransactions) ||
    !positiveNumber(request.targetTps) ||
    request.targetTps > LOAD_TEST_LOCAL_MAX_TPS ||
    !positiveInteger(request.concurrency) ||
    !nonNegativeInteger(request.rampUpSeconds) ||
    !positiveInteger(request.durationSeconds)
  )
    return;
  if (request.mode === 'STRESS' && request.rampUpSeconds === 0) return;
  if (Object.hasOwn(request, 'additionalAtms')) {
    if (
      !Array.isArray(request.additionalAtms) ||
      request.additionalAtms.length < 1 ||
      request.additionalAtms.length >= 100 ||
      request.additionalAtms.some(
        (atm: unknown) =>
          !isRecord(atm) ||
          Object.keys(atm).length !== 2 ||
          !isUuid(atm.atmId) ||
          !positiveInteger(atm.atmRevision),
      )
    )
      return;
    const ids = [request.atmId, ...request.additionalAtms.map((atm: LoadTestAtm) => atm.atmId)];
    if (new Set(ids).size !== ids.length) return;
  }

  return request as unknown as LoadTestDraft;
}
