import type { BalanceContextProvider, BalanceContextLease, BalanceTarget } from './balance-ports';
import type { BalanceReadiness } from '../../../../packages/domain/src/balance-inquiry';
import { isWithdrawalAmount } from '../../../../packages/domain/src/withdrawal';
import type { CardIdentityService } from './card-identity-service';
import type {
  QaExecutionProfile,
  FileQaExecutionProfiles,
} from './infrastructure/qa-execution-profiles';
import {
  qaWithdrawalProfileFingerprint,
  type QaWithdrawalPolicies,
  type QaWithdrawalPolicy,
} from './infrastructure/qa-withdrawal-policies';
import {
  QaBalanceExecutionProvider,
  type QaPinCipherAvailability,
} from './qa-balance-execution-provider';
import type { QaPinEntry } from './adapters/qa-pin-entry';
import { balanceContextErrorLabels } from './balance-context-errors';

export class QaWithdrawalExecutionProvider implements BalanceContextProvider {
  constructor(
    private readonly profile: QaExecutionProfile,
    private readonly profiles: Pick<FileQaExecutionProfiles, 'read' | 'reserve'>,
    private readonly policies: QaWithdrawalPolicies,
    private readonly cards: Pick<CardIdentityService, 'current' | 'withTransaction'>,
    private readonly pinEntry: QaPinEntry,
    private readonly cipher: QaPinCipherAvailability,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async policy(target: BalanceTarget): Promise<QaWithdrawalPolicy> {
    const policy = (await this.policies.read()).find((row) => row.profileId === this.profile.id);
    if (!policy) throw Error('QA_WITHDRAWAL_POLICY_MISSING');
    const current = (await this.profiles.read()).profiles.find((row) => row.id === this.profile.id);
    if (
      !current ||
      policy.profileFingerprint !== qaWithdrawalProfileFingerprint(current) ||
      policy.profileFingerprint !== qaWithdrawalProfileFingerprint(this.profile)
    )
      throw Error('QA_WITHDRAWAL_POLICY_CHANGED');
    if (
      !isWithdrawalAmount(target.draft.amount) ||
      (policy.allowedAmounts !== 'ANY_POSITIVE_AMOUNT' &&
        !policy.allowedAmounts.includes(target.draft.amount))
    )
      throw Error('QA_WITHDRAWAL_AMOUNT_NOT_ALLOWED');
    return policy;
  }

  private async provider(target: BalanceTarget): Promise<QaBalanceExecutionProvider> {
    const policy = await this.policy(target);
    const snapshot = JSON.stringify(policy);
    return new QaBalanceExecutionProvider(
      this.profile,
      this.profiles,
      this.cards,
      this.pinEntry,
      this.cipher,
      this.clock,
      {
        kind: 'WITHDRAWAL',
        amount: target.draft.amount!,
        emv: policy.transactionType === 'BOUND_PROFILE' ? 'BALANCE_PROFILE' : 'CASH',
        validate: async () => {
          if (JSON.stringify(await this.policy(target)) !== snapshot)
            throw Error('QA_WITHDRAWAL_POLICY_CHANGED');
        },
      },
    );
  }

  async inspect(target: BalanceTarget): Promise<BalanceReadiness> {
    try {
      return await (await this.provider(target)).inspect(target);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const id = Object.hasOwn(balanceContextErrorLabels, code)
        ? code
        : 'QA_WITHDRAWAL_POLICY_UNAVAILABLE';
      return { ready: false, blockers: [{ id, label: balanceContextErrorLabels[id]! }] };
    }
  }

  async acquire(target: BalanceTarget, signal: AbortSignal): Promise<BalanceContextLease> {
    return (await this.provider(structuredClone(target))).acquire(structuredClone(target), signal);
  }
}
