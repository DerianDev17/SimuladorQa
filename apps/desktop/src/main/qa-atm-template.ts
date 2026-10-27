import type { CatalogSnapshot } from '../../../../packages/domain/src/catalogs';
import { selectableAtms } from '../../../../packages/domain/src/catalogs';
import type { BalanceContextProvider, BalanceTarget, BalanceContextLease } from './balance-ports';
import type { BalanceReadiness } from '../../../../packages/domain/src/balance-inquiry';
import type { CardIdentityService } from './card-identity-service';
import type { QaPinEntry } from './adapters/qa-pin-entry';
import {
  QaBalanceExecutionProvider,
  type QaPinCipherAvailability,
} from './qa-balance-execution-provider';
import { QaWithdrawalExecutionProvider } from './qa-withdrawal-execution-provider';
import { QaBalanceContextRouter } from './qa-balance-context-router';
import {
  qaExecutionProfileIdentity,
  type FileQaExecutionProfiles,
  type QaExecutionProfile,
} from './infrastructure/qa-execution-profiles';
import {
  qaWithdrawalProfileFingerprint,
  type QaWithdrawalPolicies,
} from './infrastructure/qa-withdrawal-policies';
import { balanceContextErrorLabels } from './balance-context-errors';

type ProfileStore = Pick<FileQaExecutionProfiles, 'read' | 'reserve'>;

// The user's ATM20521 template applies only to this QA entity/link. Catalog
// identity is read in Main on every operation; no per-ATM executable file exists.
export class QaAtmTemplate {
  constructor(
    private readonly profiles: ProfileStore,
    private readonly catalog: () => Promise<CatalogSnapshot>,
    private readonly policies: QaWithdrawalPolicies,
  ) {}

  private async snapshot(target: BalanceTarget) {
    const [state, catalog] = await Promise.all([this.profiles.read(), this.catalog()]);
    const atm = selectableAtms(catalog).find((item) => item.id === target.draft.atmId);
    const entity = catalog.entities.find((item) => item.id === atm?.entityId);
    if (
      catalog.environment !== 'QA' ||
      target.draft.environment !== 'QA' ||
      !atm ||
      atm.environment !== 'QA' ||
      entity?.code !== '205' ||
      atm.revision !== target.draft.atmRevision ||
      atm.terminalId !== target.terminalId ||
      !/^[A-Z0-9]{8}$/.test(atm.terminalId) ||
      !/^\d{1,11}$/.test(atm.acquirerId)
    )
      throw Error('QA_TEMPLATE_ATM_INVALID');
    const source =
      state.profiles.find((item) => item.atmId === atm.id) ??
      state.profiles.find((item) => item.terminalId === 'ATM20521');
    const sourceAtm = selectableAtms(catalog).find((item) => item.id === source?.atmId);
    if (
      !source ||
      !sourceAtm ||
      sourceAtm.entityId !== atm.entityId ||
      sourceAtm.terminalId !== source.terminalId ||
      source.endpoint.host !== target.endpoint.host ||
      source.endpoint.port !== target.endpoint.port
    )
      throw Error('QA_TEMPLATE_UNAVAILABLE');
    const fixedFields = new Map(source.fixedFields);
    // F32 uses the existing ISOBASEI binary digit count + packed BCD encoding.
    fixedFields.set(
      32,
      Buffer.concat([
        Buffer.of(atm.acquirerId.length),
        Buffer.from(atm.acquirerId.padStart(Math.ceil(atm.acquirerId.length / 2) * 2, '0'), 'hex'),
      ]),
    );
    const profile: QaExecutionProfile = {
      ...source,
      id: source.atmId === atm.id ? source.id : atm.id,
      atmId: atm.id,
      atmRevision: atm.revision,
      terminalId: atm.terminalId,
      fixedFields,
    };
    const row = state.file.profiles.find((item) => item.id === source.id)!;
    return { source, profile, row, sourceAtm };
  }

  async resolve(target: BalanceTarget) {
    const initial = await this.snapshot(target);
    const sourceIdentity = qaExecutionProfileIdentity(initial.source);
    const identity = qaExecutionProfileIdentity(initial.profile);
    const validate = async () => {
      const current = await this.snapshot(target);
      if (
        qaExecutionProfileIdentity(current.source) !== sourceIdentity ||
        qaExecutionProfileIdentity(current.profile) !== identity ||
        current.sourceAtm.revision !== initial.sourceAtm.revision
      )
        throw Error('QA_PROFILE_CHANGED');
      return current;
    };
    const profiles: ProfileStore = {
      read: async () => {
        const current = await validate();
        return {
          profiles: [current.profile],
          file: { version: 1, profiles: [{ ...current.row, id: current.profile.id }] },
        };
      },
      reserve: async (id, signal, expected) => {
        await validate();
        if (id !== initial.profile.id || expected !== identity || signal.aborted)
          throw Error('QA_PROFILE_CHANGED');
        // All derived terminals consume the SAME on-disk pool under its file
        // lock. Never copy reservations or allocate a new range per ATM.
        return this.profiles.reserve(initial.source.id, signal, sourceIdentity);
      },
    };
    const policies: QaWithdrawalPolicies = {
      read: async () => {
        await validate();
        const policy = (await this.policies.read()).find(
          (item) => item.profileId === initial.source.id,
        );
        if (!policy) return [];
        if (policy.profileFingerprint !== qaWithdrawalProfileFingerprint(initial.source))
          throw Error('QA_WITHDRAWAL_POLICY_CHANGED');
        return [
          {
            ...policy,
            profileId: initial.profile.id,
            profileFingerprint: qaWithdrawalProfileFingerprint(initial.profile),
          },
        ];
      },
    };
    return {
      profile: initial.profile,
      profiles,
      policies,
      validate: async () => {
        await validate();
      },
    };
  }
}

export class QaTemplateContextProvider implements BalanceContextProvider {
  constructor(
    private readonly template: QaAtmTemplate,
    private readonly operation: 'BALANCE' | 'WITHDRAWAL',
    private readonly cards: Pick<CardIdentityService, 'current' | 'withTransaction'>,
    private readonly pinEntry: QaPinEntry,
    private readonly cipher: QaPinCipherAvailability,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async context(target: BalanceTarget) {
    const resolved = await this.template.resolve(target);
    const { profile, profiles, policies } = resolved;
    const provider =
      this.operation === 'BALANCE'
        ? new QaBalanceExecutionProvider(
            profile,
            profiles,
            this.cards,
            this.pinEntry,
            this.cipher,
            this.clock,
          )
        : new QaWithdrawalExecutionProvider(
            profile,
            profiles,
            policies,
            this.cards,
            this.pinEntry,
            this.cipher,
            this.clock,
          );
    const router = new QaBalanceContextRouter(this.operation);
    router.bind({
      atmId: profile.atmId,
      atmRevision: profile.atmRevision,
      terminalId: profile.terminalId,
      endpoint: profile.endpoint,
      provider,
    });
    return { router, validate: resolved.validate };
  }

  async inspect(target: BalanceTarget): Promise<BalanceReadiness> {
    try {
      return await (await this.context(target)).router.inspect(target);
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      const id = Object.hasOwn(balanceContextErrorLabels, code) ? code : 'QA_TEMPLATE_UNAVAILABLE';
      return { ready: false, blockers: [{ id, label: balanceContextErrorLabels[id]! }] };
    }
  }

  async acquire(target: BalanceTarget, signal: AbortSignal): Promise<BalanceContextLease> {
    const { router, validate } = await this.context(target);
    const lease = await router.acquire(target, signal);
    const validateOperation = lease.validate;
    // Revalidate template, catalog and withdrawal policy immediately before TCP.
    lease.validate = async () => {
      await validate();
      await validateOperation?.();
    };
    return lease;
  }
}
