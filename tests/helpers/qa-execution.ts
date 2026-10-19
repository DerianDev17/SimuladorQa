import { randomUUID } from 'node:crypto';
import { balanceLease, balanceTarget } from './balance-inquiry';
import { syntheticAid, syntheticPan, success, tlv } from './card-identity';
import { parseQaExecutionProfileFile } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import type { QaExecutionProfile } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import {
  qaWithdrawalProfileFingerprint,
  type QaWithdrawalPolicy,
} from '../../apps/desktop/src/main/infrastructure/qa-withdrawal-policies';

export function qaWithdrawalPolicy(profile: QaExecutionProfile): QaWithdrawalPolicy {
  return {
    id: randomUUID(),
    profileId: profile.id,
    profileFingerprint: qaWithdrawalProfileFingerprint(profile),
    approvalReference: 'SYNTHETIC TEST ONLY',
    validationSource: 'PROVIDER',
    environment: 'QA',
    account: 'SAVINGS',
    currency: '840',
    transactionType: '01',
    authorisedAmount: 'REQUESTED_AMOUNT',
    field55Source: 'CDOL1_VALUES',
    pinAndFixedFields: 'BOUND_PROFILE',
    allowedAmounts: ['20.00', '40.00'],
    responsePolicy: 'EXACT_AMOUNT_OR_REVIEW',
  };
}

// All data in this fixture is synthetic. It must never be provisioned in the app.
export function qaExecutionFixture() {
  const target = balanceTarget();
  const lease = balanceLease(target);
  const fixedFields = Object.fromEntries(
    [...lease.privateFields]
      .filter(([field]) => ![2, 14, 23, 35, 52, 55].includes(field))
      .map(([field, value]) => [field, Buffer.from(value).toString('hex').toUpperCase()]),
  );
  const row = {
    id: randomUUID(),
    environment: 'QA',
    entityCode: '205',
    atmId: target.draft.atmId!,
    atmRevision: 1,
    terminalId: target.terminalId,
    endpoint: target.endpoint,
    keyReference: randomUUID(),
    applicationId: syntheticAid.toString('hex').toUpperCase(),
    cardBin: '444444',
    pinAlgorithm: 'TDEA_2KEY_ECB',
    pinEncoding: 'EXTREME_ANSI_IL',
    timeZone: 'America/Guayaquil',
    accountingDate: '2026-10-13',
    header: Buffer.from(lease.header).toString('hex').toUpperCase(),
    extension: '0000',
    fixedFields,
    emv: {
      parameters: {
        environment: 'QA',
        terminalCapabilities: '604020',
        terminalType: '14',
        additionalTerminalCapabilities: 'EF80B05010',
        tacDenial: null,
        tacOnline: 'FFFFFFFFFF',
        tacDefault: 'FFFFFFFFFF',
      },
      countryCode: '218',
      transactionType: '30',
      applicationVersion: '0002',
      issuerUsage: 'SERVICES',
      extraTags: {},
      field55Tags: [
        '9F26',
        '9F27',
        '9F36',
        '9F10',
        '95',
        '9A',
        '9C',
        '9F02',
        '5F2A',
        '9F37',
        '9F34',
        '82',
      ],
    },
    reservedSequences: [650101, 650102],
    approvalReference: 'SYNTHETIC TEST ONLY',
  };
  const input = { version: 1, profiles: [row] };
  const profile = parseQaExecutionProfileFile(input).profiles[0]!;
  lease.release();
  return { target, row, input, profile };
}

export function qaCardFields(): Map<string, Uint8Array> {
  return new Map(
    Object.entries({
      '5A': syntheticPan,
      '57': syntheticPan + 'D2912101' + '0'.repeat(13) + 'F',
      '5F24': '291231',
      '5F34': '01',
      '82': '1000',
      '5F28': '0218',
      '9F08': '0002',
      '9F07': '0E00',
      '9F42': '0840',
      '8C': '9F02069F03069F1A0295055F2A029A039C019F3704',
      '8E': '00'.repeat(8) + '0203',
      '9F0E': '0000000000',
      '9F0F': 'FFFFFFFFFF',
      '9F0D': 'FFFFFFFFFF',
    }).map(([tag, value]) => [tag, Buffer.from(value, 'hex')]),
  );
}
export function qaAcResponse(atc = 1, cid = 0x80): Uint8Array {
  const counter = Buffer.alloc(2);
  counter.writeUInt16BE(atc);
  return success(tlv('80', Buffer.of(cid), counter, Buffer.alloc(8, atc), Buffer.of(1)));
}
export const qaNow = new Date('2026-10-13T20:00:00.000Z');
export const qaCalendar = { year: 2026, month: 10, day: 13, hour: 15, minute: 0, second: 0 };
