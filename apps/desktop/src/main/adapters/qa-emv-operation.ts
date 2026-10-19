import { randomBytes } from 'node:crypto';
import { analyseQaOnlineAtm } from '../../../../../packages/domain/src/emv-terminal-analysis';
import type { EmvTerminalParameters } from '../../../../../packages/domain/src/emv-terminal-analysis';
import type { HostCalendar } from './coonecta-balance-rules';
import type { BalanceDiagnostics } from '../../../../../packages/domain/src/balance-inquiry';
import { exchangeCard, parseCardDol, parseCardTlv } from './emv-card-identity';
import type { CardApduSession } from './emv-card-identity';
import { isWithdrawalAmount } from '../../../../../packages/domain/src/withdrawal';

export interface QaEmvOperationPolicy {
  parameters: EmvTerminalParameters;
  countryCode: string;
  transactionType: string;
  applicationVersion: string;
  issuerUsage: 'SERVICES' | 'CASH';
  extraTags: ReadonlyMap<string, Uint8Array>;
  field55Tags: readonly string[];
}

const invalid = (): never => {
  throw Error('QA_EMV_PROFILE_UNSUPPORTED');
};
function required(fields: ReadonlyMap<string, Uint8Array>, tag: string, size?: number): Uint8Array {
  const value = fields.get(tag);
  if (!value || (size !== undefined && value.length !== size)) return invalid();
  return value;
}
function bcdDate(value: Uint8Array): string {
  const text = Buffer.from(value).toString('hex');
  if (!/^\d{6}$/.test(text)) invalid();
  const date = new Date(
    Date.UTC(2000 + Number(text.slice(0, 2)), Number(text.slice(2, 4)) - 1, Number(text.slice(4))),
  );
  if (
    date.getUTCMonth() + 1 !== Number(text.slice(2, 4)) ||
    date.getUTCDate() !== Number(text.slice(4))
  )
    invalid();
  return text;
}
function operationCvm(
  fields: ReadonlyMap<string, Uint8Array>,
  cash: boolean,
  amount: bigint,
): {
  result: Uint8Array;
  tvrByte3: number;
} {
  const list = required(fields, '8E');
  if (list.length < 10 || list.length % 2) invalid();
  const bytes = Buffer.from(list);
  let result = Buffer.of(0x3f, 0, 1); // no supported CVM performed
  for (let cursor = 8; cursor < bytes.length; cursor += 2) {
    const code = bytes[cursor]!,
      method = code & 0x3f,
      condition = bytes[cursor + 1]!;
    let applies: boolean;
    if (condition === 0) applies = true;
    else if (condition === 1) applies = cash;
    else if (condition === 2) applies = !cash;
    else if ([4, 5].includes(condition))
      applies = false; // no manual cash/cashback
    else if (condition === 3)
      applies = method === 0 || method === 2; // Fail CVM is always supported
    else if (condition >= 6 && condition <= 9) {
      const currency = required(fields, '9F42', 2);
      if (Buffer.from(currency).toString('hex') !== '0840') invalid();
      const limit = BigInt(bytes.readUInt32BE(condition <= 7 ? 0 : 4));
      applies = condition === 6 || condition === 8 ? amount < limit : amount > limit;
    } else return invalid();
    if (!applies) continue;
    if (code & 0x80 || ![0, 1, 2, 3, 4, 5, 0x1e, 0x1f].includes(method)) invalid();
    if (method === 2) return { result: Buffer.of(code, condition, 0), tvrByte3: 0x04 };
    if (method === 0) result = Buffer.of(code, condition, 1);
    // 604020 supports online PIN only. A recognised but unsupported CVM
    // fails according to its continuation bit; it is not a profile error.
    // Book 4 §6.3.4.5/Table 2: retain the last performed CVM, or 3F0001.
    if (!(code & 0x40)) return { result, tvrByte3: 0x80 };
  }
  return { result, tvrByte3: 0x80 };
}

// EMV Book 3 §§6.5.5, 9, 10.4/10.5/10.7 and Annex C. A deliberately
// Bounded QA path: online-only type 14, online PIN, no ODA/CDA. Cash requires
// an explicit amount and the separately approved CASH/01 contract. Captured
// 9C=80/9F02=0 is not a generation rule and is deliberately unsupported.
export class QaEmvOperation {
  async generate(
    session: CardApduSession,
    card: ReadonlyMap<string, Uint8Array>,
    policy: QaEmvOperationPolicy,
    local: HostCalendar,
    signal: AbortSignal,
    onAnalysis?: (
      analysis: Pick<
        BalanceDiagnostics,
        'terminalApplicationVersion' | 'cardApplicationVersion' | 'tvr' | 'cvmResult'
      >,
    ) => void,
    amount?: string,
  ): Promise<Uint8Array> {
    const values = new Map<string, Uint8Array>();
    let command: Buffer | undefined;
    let responseData: Uint8Array | undefined;
    try {
      const cash = policy.issuerUsage === 'CASH';
      if (
        signal.aborted ||
        policy.parameters.environment !== 'QA' ||
        policy.parameters.terminalType !== '14' ||
        policy.parameters.terminalCapabilities !== '604020' ||
        (!cash && policy.issuerUsage !== 'SERVICES') ||
        !/^\d{3}$/.test(policy.countryCode) ||
        (cash
          ? policy.transactionType !== '01' || !isWithdrawalAmount(amount)
          : policy.transactionType !== '30' || amount !== undefined) ||
        !/^[A-F0-9]{4}$/.test(policy.applicationVersion)
      )
        invalid();
      const panSequence = required(card, '5F34', 1);
      if (panSequence[0]! >> 4 > 9 || (panSequence[0]! & 0x0f) > 9) invalid();
      const aip = required(card, '82', 2);
      if (!(aip[0]! & 0x10)) invalid(); // cardholder verification supported
      const authorised = cash ? amount!.replace('.', '').padStart(12, '0') : '0'.repeat(12);
      const cvm = operationCvm(card, cash, BigInt(authorised));
      const tvr = Buffer.of(0x80, 0, cvm.tvrByte3, 0, 0); // ODA not performed; actual CVM result
      if (
        !Buffer.from(required(card, '9F08', 2)).equals(
          Buffer.from(policy.applicationVersion, 'hex'),
        )
      )
        tvr[1] = tvr[1]! | 0x80;
      const date = `${String(local.year).slice(-2)}${String(local.month).padStart(2, '0')}${String(local.day).padStart(2, '0')}`;
      bcdDate(Buffer.from(date, 'hex'));
      if (bcdDate(required(card, '5F24', 3)) < date) tvr[1] = tvr[1]! | 0x40;
      const effective = card.get('5F25');
      if (effective && bcdDate(effective) > date) tvr[1] = tvr[1]! | 0x20;
      const usage = required(card, '9F07', 2);
      const domestic = Buffer.from(required(card, '5F28', 2)).equals(
        Buffer.from('0' + policy.countryCode, 'hex'),
      );
      const usageMask = cash ? (domestic ? 0x80 : 0x40) : domestic ? 0x08 : 0x04;
      if (!(usage[0]! & 0x02) || !(usage[0]! & usageMask)) tvr[1] = tvr[1]! | 0x10;
      const action = (tag: string): string | null => {
        const value = card.get(tag);
        if (!value) return null;
        if (value.length !== 5) invalid();
        return Buffer.from(value).toString('hex').toUpperCase();
      };
      if (
        analyseQaOnlineAtm({
          parameters: policy.parameters,
          tvr: tvr.toString('hex').toUpperCase(),
          issuerActionCodes: {
            denial: action('9F0E'),
            online: action('9F0F'),
            default: action('9F0D'),
          },
          phase: 'BEFORE_FIRST_AC',
        }).requestedCryptogram !== 'ARQC'
      )
        throw Error('QA_EMV_CARD_DECLINED');
      for (const [tag, value] of policy.extraTags) values.set(tag, Buffer.from(value));
      const generated = new Map<string, Uint8Array>([
        ['5F34', Buffer.from(panSequence)],
        ['9F02', Buffer.from(authorised, 'hex')],
        ['9F03', Buffer.alloc(6)],
        ['9F1A', Buffer.from('0' + policy.countryCode, 'hex')],
        ['95', tvr],
        ['5F2A', Buffer.from('0840', 'hex')],
        ['9A', Buffer.from(date, 'hex')],
        ['9C', Buffer.from(policy.transactionType, 'hex')],
        ['9F37', randomBytes(4)],
        ['82', Buffer.from(aip)],
        ['9F33', Buffer.from(policy.parameters.terminalCapabilities, 'hex')],
        ['9F35', Buffer.from(policy.parameters.terminalType, 'hex')],
        ['9F40', Buffer.from(policy.parameters.additionalTerminalCapabilities, 'hex')],
        ['9F34', cvm.result],
        ['9F09', Buffer.from(policy.applicationVersion, 'hex')],
      ]);
      for (const [tag, value] of generated) {
        values.get(tag)?.fill(0);
        values.set(tag, value);
      }
      let dol;
      try {
        dol = parseCardDol(required(card, '8C'));
      } catch (error) {
        throw Error('QA_EMV_PROFILE_UNSUPPORTED', { cause: error });
      }
      // This cash contract covers only cards which bind both fields into the
      // first AC. No post-AC amount/type rewriting is permitted in F55.
      if (
        cash &&
        (dol.filter((item) => item.tag === '9F02' && item.length === 6).length !== 1 ||
          dol.filter((item) => item.tag === '9C' && item.length === 1).length !== 1)
      )
        invalid();
      const data = Buffer.concat(
        dol.map((item) => {
          const value = required(values, item.tag, item.length);
          return value;
        }),
      );
      if (!data.length || data.length > 255) {
        data.fill(0);
        invalid();
      }
      command = Buffer.concat([Buffer.of(0x80, 0xae, 0x80, 0, data.length), data, Buffer.of(0)]);
      data.fill(0);
      if (signal.aborted) throw Error('QA_EMV_CANCELLED');
      const response = await exchangeCard(session, command);
      responseData = response.data;
      if (response.status !== 0x9000 || signal.aborted) throw Error('QA_EMV_COMMAND_REJECTED');
      const nodes = parseCardTlv(response.data);
      if (nodes.length !== 1) invalid();
      if (nodes[0]!.tag === '80') {
        const bytes = nodes[0]!.value;
        if (bytes.length < 11 || bytes.length > 43) invalid();
        values.set('9F27', Buffer.from(bytes.subarray(0, 1)));
        values.set('9F36', Buffer.from(bytes.subarray(1, 3)));
        values.set('9F26', Buffer.from(bytes.subarray(3, 11)));
        if (bytes.length > 11) values.set('9F10', Buffer.from(bytes.subarray(11)));
      } else if (nodes[0]!.tag === '77') {
        for (const tag of ['9F27', '9F36', '9F26', '9F10']) {
          const rows = nodes[0]!.children.filter((node) => node.tag === tag);
          if (rows.length > 1) invalid();
          if (rows[0]) values.set(tag, Buffer.from(rows[0].value));
        }
      } else invalid();
      if ((required(values, '9F27', 1)[0]! & 0xc0) !== 0x80) throw Error('QA_EMV_CARD_DECLINED');
      required(values, '9F36', 2);
      required(values, '9F26', 8);
      // Approved frame 218 carries the chip sequence in F55. On the 82052
      // route F23 is omitted; SRVPIN otherwise substitutes 5F34=00 (2026-10-16).
      // Keep older saved profiles usable while always carrying the actual value.
      const field55Tags = policy.field55Tags.includes('5F34')
        ? policy.field55Tags
        : [...policy.field55Tags, '5F34'];
      const result = Buffer.concat(
        field55Tags.map((tag) => {
          const value = required(values, tag);
          if (value.length > 127) invalid();
          return Buffer.concat([Buffer.from(tag, 'hex'), Buffer.of(value.length), value]);
        }),
      );
      if (!result.length || result.length > 255) {
        result.fill(0);
        invalid();
      }
      onAnalysis?.({
        terminalApplicationVersion: policy.applicationVersion,
        cardApplicationVersion: Buffer.from(required(card, '9F08', 2))
          .toString('hex')
          .toUpperCase(),
        tvr: tvr.toString('hex').toUpperCase(),
        cvmResult: Buffer.from(cvm.result).toString('hex').toUpperCase(),
      });
      return result;
    } finally {
      command?.fill(0);
      responseData?.fill(0);
      for (const value of values.values()) value.fill(0);
    }
  }
}
