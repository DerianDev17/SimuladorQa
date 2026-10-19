import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isRecord } from '../../../../../packages/domain/src/index';
import { isUuid } from '../../../../../packages/domain/src/catalogs';
import { isWithdrawalAmount } from '../../../../../packages/domain/src/withdrawal';
import { qaExecutionProfileIdentity, type QaExecutionProfile } from './qa-execution-profiles';

// Independent from the working balance profile. A missing/invalid withdrawal
// contract must not disable balance or change its reserved sequence pool.
export interface QaWithdrawalPolicy {
  id: string;
  profileId: string;
  profileFingerprint: string;
  approvalReference: string;
  validationSource: 'PROVIDER' | 'USER_QA_INSTRUCTION';
  environment: 'QA';
  account: 'SAVINGS';
  currency: '840';
  transactionType: '01' | 'BOUND_PROFILE';
  authorisedAmount: 'REQUESTED_AMOUNT' | 'ZERO';
  field55Source: 'CDOL1_VALUES';
  pinAndFixedFields: 'BOUND_PROFILE';
  allowedAmounts: readonly string[];
  responsePolicy: 'EXACT_AMOUNT_OR_REVIEW';
}

export interface QaWithdrawalPolicies {
  read(): Promise<readonly QaWithdrawalPolicy[]>;
}

export function qaWithdrawalProfileFingerprint(profile: QaExecutionProfile): string {
  return createHash('sha256').update(qaExecutionProfileIdentity(profile)).digest('hex');
}

const invalid = (): never => {
  throw Error('QA_WITHDRAWAL_POLICY_INVALID');
};
function exactKeys(row: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(row).length === keys.length && keys.every((key) => Object.hasOwn(row, key));
}

export function parseQaWithdrawalPolicies(input: unknown): readonly QaWithdrawalPolicy[] {
  if (
    !isRecord(input) ||
    !exactKeys(input, ['version', 'policies']) ||
    input.version !== 1 ||
    !Array.isArray(input.policies) ||
    input.policies.length > 50
  )
    return invalid();
  const policies = input.policies.map((value): QaWithdrawalPolicy => {
    if (
      !isRecord(value) ||
      !exactKeys(value, [
        'id',
        'profileId',
        'profileFingerprint',
        'approvalReference',
        'validationSource',
        'environment',
        'account',
        'currency',
        'transactionType',
        'authorisedAmount',
        'field55Source',
        'pinAndFixedFields',
        'allowedAmounts',
        'responsePolicy',
      ]) ||
      !isUuid(value.id) ||
      !isUuid(value.profileId) ||
      typeof value.profileFingerprint !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.profileFingerprint) ||
      typeof value.approvalReference !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_. /-]{1,127}$/.test(value.approvalReference) ||
      /\d{12}/.test(value.approvalReference) ||
      (value.validationSource !== 'PROVIDER' && value.validationSource !== 'USER_QA_INSTRUCTION') ||
      value.environment !== 'QA' ||
      value.account !== 'SAVINGS' ||
      value.currency !== '840' ||
      !(
        (value.transactionType === '01' && value.authorisedAmount === 'REQUESTED_AMOUNT') ||
        (value.transactionType === 'BOUND_PROFILE' && value.authorisedAmount === 'ZERO')
      ) ||
      value.field55Source !== 'CDOL1_VALUES' ||
      value.pinAndFixedFields !== 'BOUND_PROFILE' ||
      value.responsePolicy !== 'EXACT_AMOUNT_OR_REVIEW' ||
      !Array.isArray(value.allowedAmounts) ||
      !value.allowedAmounts.length ||
      value.allowedAmounts.length > 100 ||
      value.allowedAmounts.some((amount) => !isWithdrawalAmount(amount)) ||
      new Set(value.allowedAmounts).size !== value.allowedAmounts.length
    )
      return invalid();
    return {
      id: value.id,
      profileId: value.profileId,
      profileFingerprint: value.profileFingerprint,
      approvalReference: value.approvalReference,
      validationSource: value.validationSource,
      environment: 'QA',
      account: 'SAVINGS',
      currency: '840',
      transactionType: value.transactionType as QaWithdrawalPolicy['transactionType'],
      authorisedAmount: value.authorisedAmount as QaWithdrawalPolicy['authorisedAmount'],
      field55Source: 'CDOL1_VALUES',
      pinAndFixedFields: 'BOUND_PROFILE',
      allowedAmounts: [...value.allowedAmounts] as string[],
      responsePolicy: 'EXACT_AMOUNT_OR_REVIEW',
    };
  });
  if (
    new Set(policies.map((row) => row.id)).size !== policies.length ||
    new Set(policies.map((row) => row.profileId)).size !== policies.length
  )
    return invalid();
  return policies;
}

export class FileQaWithdrawalPolicies implements QaWithdrawalPolicies {
  constructor(private readonly path: string) {}
  async read(): Promise<readonly QaWithdrawalPolicy[]> {
    let file;
    try {
      file = await open(this.path, 'r');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw Error('QA_WITHDRAWAL_POLICY_UNAVAILABLE', { cause: error });
    }
    const buffer = Buffer.alloc(65537);
    try {
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await file.read(buffer, size, buffer.length - size, size);
        if (!bytesRead) break;
        size += bytesRead;
      }
      if (size > 65536) return invalid();
      return parseQaWithdrawalPolicies(
        JSON.parse(buffer.toString('utf8', 0, size).replace(/^\uFEFF/, '')),
      );
    } catch (error) {
      throw Error('QA_WITHDRAWAL_POLICY_INVALID', { cause: error });
    } finally {
      buffer.fill(0);
      await file.close();
    }
  }
}
