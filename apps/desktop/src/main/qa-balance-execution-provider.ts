import { isUuid } from '../../../../packages/domain/src/catalogs';
import type { BalanceContextProvider, BalanceContextLease, BalanceTarget } from './balance-ports';
import type {
  BalanceReadiness,
  BalanceDiagnostics,
} from '../../../../packages/domain/src/balance-inquiry';
import type { CardIdentityService } from './card-identity-service';
import type {
  QaExecutionProfile,
  FileQaExecutionProfiles,
} from './infrastructure/qa-execution-profiles';
import { qaExecutionProfileIdentity } from './infrastructure/qa-execution-profiles';
import type { HostCalendar } from './adapters/coonecta-balance-rules';
import type { QaPinEntry } from './adapters/qa-pin-entry';
import { LegacyQaPinEncryption } from './adapters/legacy-qa-pin';
import type { QaPinCipher } from './adapters/legacy-qa-pin';
import { QaEmvOperation } from './adapters/qa-emv-operation';
import { encodeVisaEmvField } from './adapters/visa-emv-field';
import { balanceContextErrorLabels } from './balance-context-errors';
import { isWithdrawalAmount } from '../../../../packages/domain/src/withdrawal';

export type QaExecutionOperation =
  | { kind: 'BALANCE' }
  | {
      kind: 'WITHDRAWAL';
      amount: string;
      emv: 'CASH' | 'BALANCE_PROFILE';
      validate(): Promise<void>;
    };

function calendar(now: Date, timeZone: string): HostCalendar {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}
export interface QaPinCipherAvailability extends QaPinCipher {
  available(reference: string): Promise<boolean>;
}

// This concrete provider creates card fields from the current Main session,
// prompts for PIN, encrypts it and obtains the first AC. It never reads a PCAP.
export class QaBalanceExecutionProvider implements BalanceContextProvider {
  constructor(
    private readonly profile: QaExecutionProfile,
    private readonly profiles: Pick<FileQaExecutionProfiles, 'read' | 'reserve'>,
    private readonly cards: Pick<CardIdentityService, 'current' | 'withTransaction'>,
    private readonly pinEntry: QaPinEntry,
    private readonly cipher: QaPinCipherAvailability,
    private readonly clock: () => Date = () => new Date(),
    private readonly operation: QaExecutionOperation = { kind: 'BALANCE' },
  ) {}

  async inspect(target: BalanceTarget): Promise<BalanceReadiness> {
    const blockers: { id: string; label: string }[] = [];
    if (this.operation.kind === 'WITHDRAWAL') await this.operation.validate();
    const state = await this.profiles.read();
    const row = state.file.profiles.find((item) => item.id === this.profile.id);
    const current = state.profiles.find((item) => item.id === this.profile.id);
    if (
      target.draft.environment !== 'QA' ||
      target.draft.scenario !== 'LOCAL' ||
      (this.operation.kind === 'BALANCE'
        ? target.draft.transaction !== 'BALANCE'
        : !['WITHDRAWAL_APPROVED', 'WITHDRAWAL_DECLINED'].includes(target.draft.transaction) ||
          !isWithdrawalAmount(target.draft.amount) ||
          target.draft.amount !== this.operation.amount) ||
      target.draft.account !== 'SAVINGS' ||
      target.draft.atmId !== this.profile.atmId ||
      target.draft.atmRevision !== this.profile.atmRevision ||
      target.terminalId !== this.profile.terminalId ||
      target.endpoint.host !== this.profile.endpoint.host ||
      target.endpoint.port !== this.profile.endpoint.port ||
      !current ||
      qaExecutionProfileIdentity(current) !== qaExecutionProfileIdentity(this.profile)
    )
      blockers.push({
        id: 'QA-PROFILE-CHANGED',
        label: 'Vuelve a cargar el perfil QA aprobado de esta instancia',
      });
    if (!(row?.reservedSequences as number[] | undefined)?.length)
      blockers.push({
        id: 'QA-SEQUENCE-POOL',
        label: 'La instancia no tiene una secuencia QA reservada disponible',
      });
    if (!(await this.cipher.available(this.profile.keyReference)))
      blockers.push({
        id: 'QA-PIN-TEST-KEY',
        label:
          'No está disponible la referencia protegida de la clave de cifrado TEST de este perfil',
      });
    const card = await this.cards.current();
    if (
      !isUuid(target.cardReadId) ||
      card?.readId !== target.cardReadId ||
      card.status !== 'READ' ||
      card.applicationId !== this.profile.applicationId
    )
      blockers.push({
        id: 'QA-CARD-SESSION',
        label: 'Vuelve a leer y seleccionar la tarjeta para esta operación',
      });
    return {
      ready: blockers.length === 0,
      blockers,
      sequencesRemaining: (row?.reservedSequences as number[] | undefined)?.length ?? 0,
    };
  }
  private async requireReady(target: BalanceTarget): Promise<void> {
    const readiness = await this.inspect(target);
    if (readiness.ready) return;
    const codes: Readonly<Record<string, string>> = {
      'QA-PROFILE-CHANGED': 'QA_PROFILE_CHANGED',
      'QA-SEQUENCE-POOL': 'QA_SEQUENCE_UNAVAILABLE',
      'QA-PIN-TEST-KEY': 'QA_PIN_UNAVAILABLE',
      'QA-CARD-SESSION': 'QA_CARD_SESSION_UNAVAILABLE',
    };
    throw Error(codes[readiness.blockers[0]?.id ?? ''] ?? 'QA_CONTEXT_UNAVAILABLE');
  }
  async acquire(target: BalanceTarget, signal: AbortSignal): Promise<BalanceContextLease> {
    await this.requireReady(target);
    if (signal.aborted) throw Error('QA_PIN_CANCELLED');
    const fields = new Map<number, Uint8Array>();
    let pin: Uint8Array | null = null;
    let pan: Uint8Array | undefined;
    let pinBlock: Uint8Array | undefined;
    let emv: Uint8Array | undefined;
    let diagnostics: BalanceDiagnostics | undefined;
    let stageError = 'QA_PIN_UNAVAILABLE';
    try {
      // Validate first; do not ask for a PIN when no key/profile/sequence exists.
      pin = await this.pinEntry.request(signal);
      if (!pin || signal.aborted) throw Error('QA_PIN_CANCELLED');
      await this.requireReady(target);
      if (signal.aborted) throw Error('QA_PIN_CANCELLED');
      const local = calendar(this.clock(), this.profile.timeZone);
      const accounting = calendar(new Date(this.profile.accountingDate + 'T12:00:00.000Z'), 'UTC');
      stageError = 'QA_CARD_SESSION_UNAVAILABLE';
      const sequence = await this.cards.withTransaction(
        target.cardReadId,
        signal,
        async (session, card) => {
          stageError = 'QA_CARD_PROFILE_UNSUPPORTED';
          const panPacked = card.get('5A'),
            track = card.get('57'),
            expiry = card.get('5F24'),
            number = card.get('5F34');
          if (
            !panPacked ||
            panPacked.length !== 8 ||
            !track ||
            track.length > 19 ||
            !expiry ||
            expiry.length !== 3 ||
            !number ||
            number.length !== 1
          )
            throw Error('QA_CARD_PROFILE_UNSUPPORTED');
          pan = Buffer.from(Buffer.from(panPacked).toString('hex'), 'ascii');
          if (
            !pan.every((byte) => byte >= 48 && byte <= 57) ||
            !Buffer.from(pan.subarray(0, 6)).equals(Buffer.from(this.profile.cardBin, 'ascii')) ||
            !/^\d{2}$/.test(Buffer.from(number).toString('hex'))
          )
            throw Error('QA_CARD_PROFILE_UNSUPPORTED');
          const trackText = Buffer.from(track).toString('hex').toUpperCase().replace(/F$/, '');
          if (
            !/^[0-9]+D[0-9]+$/.test(trackText) ||
            !trackText.startsWith(Buffer.from(pan).toString('ascii') + 'D') ||
            trackText.slice(17, 21) !== Buffer.from(expiry.subarray(0, 2)).toString('hex') ||
            trackText.length > 37
          )
            throw Error('QA_CARD_PROFILE_UNSUPPORTED');
          fields.set(2, Buffer.concat([Buffer.of(16), panPacked]));
          fields.set(14, Buffer.from(expiry.subarray(0, 2)));
          fields.set(23, Buffer.concat([Buffer.of(0), number]));
          // Approved CB frame 218 packs odd F35 lengths with a leading zero,
          // unlike tag 57's trailing F. The prefix counts digits, not bytes.
          const isoTrack = Buffer.alloc(1 + Math.ceil(trackText.length / 2));
          isoTrack[0] = trackText.length;
          isoTrack.write(trackText.padStart((isoTrack.length - 1) * 2, '0'), 1, 'hex');
          fields.set(35, isoTrack);
          stageError = 'QA_PIN_UNAVAILABLE';
          pinBlock = await new LegacyQaPinEncryption(this.cipher).encrypt(
            { environment: 'QA', pan, pin: pin!, keyReference: this.profile.keyReference },
            signal,
          );
          fields.set(52, Buffer.from(pinBlock));
          // Preserve the finite approved pool on card/cipher failures. Reserve
          // before GENERATE AC; never recycle a sequence after chip processing.
          stageError = 'QA_SEQUENCE_UNAVAILABLE';
          if (this.operation.kind === 'WITHDRAWAL') await this.operation.validate();
          const sequence = await this.profiles.reserve(
            this.profile.id,
            signal,
            qaExecutionProfileIdentity(this.profile),
          );
          stageError = 'QA_EMV_PROFILE_UNSUPPORTED';
          emv = await new QaEmvOperation().generate(
            session,
            card,
            this.operation.kind === 'WITHDRAWAL' && this.operation.emv === 'CASH'
              ? { ...this.profile.emv, issuerUsage: 'CASH', transactionType: '01' }
              : this.profile.emv,
            local,
            signal,
            (analysis) => {
              diagnostics = {
                ...analysis,
                profileId: this.profile.id,
                accountingDate: this.profile.accountingDate,
              };
            },
            this.operation.kind === 'WITHDRAWAL' && this.operation.emv === 'CASH'
              ? this.operation.amount
              : undefined,
          );
          fields.set(55, encodeVisaEmvField(emv));
          return sequence;
        },
        this.profile.emv.countryCode,
      );
      for (const [field, value] of this.profile.fixedFields) fields.set(field, Buffer.from(value));
      if (this.operation.kind === 'WITHDRAWAL') await this.operation.validate();
      return {
        ...(this.operation.kind === 'WITHDRAWAL'
          ? {
              amount: this.operation.amount,
              validate: this.operation.validate,
            }
          : {}),
        environment: 'QA',
        profileId: this.profile.id,
        cardReadId: target.cardReadId,
        endpoint: { ...this.profile.endpoint },
        securitySource: 'GENERATED_TEST_SESSION',
        ...(diagnostics ? { diagnostics } : {}),
        validUntil: new Date(this.clock().getTime() + 30000).toISOString(),
        release: () => {
          for (const value of fields.values()) value.fill(0);
        },
        account: 'SAVINGS',
        sequence,
        transmission: { ...local },
        local,
        accounting,
        terminalId: this.profile.terminalId,
        header: Buffer.from(this.profile.header),
        extension: Buffer.from(this.profile.extension),
        privateFields: fields,
      };
    } catch (error) {
      for (const value of fields.values()) value.fill(0);
      const code = error instanceof Error ? error.message : '';
      // Backend causes can contain PIN/card data; preserve only fixed codes
      // and otherwise report the stage, never the original error text.
      // eslint-disable-next-line preserve-caught-error
      throw Error(
        Object.hasOwn(balanceContextErrorLabels, code)
          ? code
          : ['CARD_TIMEOUT', 'PCSC_TIMEOUT'].includes(code)
            ? 'QA_CARD_SESSION_TIMEOUT'
            : code.startsWith('CARD_')
              ? 'QA_CARD_SESSION_UNAVAILABLE'
              : code === 'QA_CONTEXT_UNAVAILABLE'
                ? code
                : stageError,
      );
    } finally {
      pin?.fill(0);
      pan?.fill(0);
      pinBlock?.fill(0);
      emv?.fill(0);
    }
  }
}
