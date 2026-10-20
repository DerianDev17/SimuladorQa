import { isUuid } from './catalogs';

export type LoadTestOperation = 'BALANCE';
export type LoadTestMode = 'LOAD' | 'STRESS';

// Temporary local ceiling reported by the user for the QA switch. This does
// not represent a vendor-approved capacity or authorize a run by itself.
export const LOAD_TEST_LOCAL_MAX_TPS = 5;

export interface LoadTestDraft {
  environment: 'QA';
  mode: LoadTestMode;
  operation: LoadTestOperation;
  atmId: string;
  atmRevision: number;
  maxTransactions: number;
  targetTps: number;
  concurrency: number;
  rampUpSeconds: number;
  durationSeconds: number;
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

  return request as unknown as LoadTestDraft;
}
