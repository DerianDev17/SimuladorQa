import { open, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isIPv4 } from 'node:net';
import { isUuid, isRevision } from '../../../../../packages/domain/src/catalogs';
import { isRecord } from '../../../../../packages/domain/src/index';
import { parseQaEmvTerminalParameters } from '../adapters/emv-terminal-parameters';
import type { QaEmvOperationPolicy } from '../adapters/qa-emv-operation';

const fixedNumbers = [18, 19, 22, 25, 28, 32, 42, 43, 48, 49, 53, 60, 62];
const allowedTags = new Set([
  '9F26',
  '9F27',
  '9F10',
  '9F37',
  '9F36',
  '95',
  '9A',
  '9C',
  '9F02',
  '5F2A',
  '5F34',
  '82',
  '9F1A',
  '9F03',
  '9F33',
  '9F34',
  '9F35',
  '9F40',
  '9F09',
  '9F1E',
  '84',
  '9F1D',
  '9F53',
  '9F39',
  '9F06',
]);

export interface QaExecutionProfile {
  id: string;
  atmId: string;
  atmRevision: number;
  terminalId: string;
  endpoint: { host: string; port: number };
  keyReference: string;
  applicationId: string;
  cardBin: string;
  approvalReference: string;
  timeZone: string;
  accountingDate: string;
  header: Uint8Array;
  extension: Uint8Array;
  fixedFields: ReadonlyMap<number, Uint8Array>;
  emv: QaEmvOperationPolicy;
}
export interface QaExecutionProfileFile {
  version: 1;
  profiles: Record<string, unknown>[];
}

function keys(row: Record<string, unknown>, names: string[]): boolean {
  return (
    Object.keys(row).length === names.length && names.every((name) => Object.hasOwn(row, name))
  );
}
function bytes(value: unknown, length?: number): Buffer {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-F0-9]{2}){1,256}$/.test(value) ||
    (length !== undefined && value.length !== length * 2)
  )
    throw Error('QA_PROFILE_INVALID');
  return Buffer.from(value, 'hex');
}
function profile(row: Record<string, unknown>): QaExecutionProfile {
  if (
    !keys(row, [
      'id',
      'environment',
      'entityCode',
      'atmId',
      'atmRevision',
      'terminalId',
      'endpoint',
      'keyReference',
      'applicationId',
      'cardBin',
      'pinAlgorithm',
      'pinEncoding',
      'timeZone',
      'accountingDate',
      'header',
      'extension',
      'fixedFields',
      'emv',
      'reservedSequences',
      'approvalReference',
    ]) ||
    row.environment !== 'QA' ||
    row.entityCode !== '205' ||
    !isUuid(row.id) ||
    !isUuid(row.atmId) ||
    !isRevision(row.atmRevision) ||
    typeof row.terminalId !== 'string' ||
    !/^[A-Z0-9]{8}$/.test(row.terminalId) ||
    !isUuid(row.keyReference) ||
    typeof row.applicationId !== 'string' ||
    !/^(?:[A-F0-9]{2}){5,16}$/.test(row.applicationId) ||
    typeof row.cardBin !== 'string' ||
    !/^\d{6}$/.test(row.cardBin) ||
    row.pinAlgorithm !== 'TDEA_2KEY_ECB' ||
    row.pinEncoding !== 'EXTREME_ANSI_IL' ||
    typeof row.approvalReference !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9_. /-]{1,127}$/.test(row.approvalReference) ||
    /\d{12}/.test(row.approvalReference)
  )
    throw Error('QA_PROFILE_INVALID');
  if (
    !isRecord(row.endpoint) ||
    !keys(row.endpoint, ['host', 'port']) ||
    typeof row.endpoint.host !== 'string' ||
    !isIPv4(row.endpoint.host) ||
    !Number.isInteger(row.endpoint.port) ||
    Number(row.endpoint.port) < 1 ||
    Number(row.endpoint.port) > 65535
  )
    throw Error('QA_PROFILE_INVALID');
  if (
    typeof row.timeZone !== 'string' ||
    typeof row.accountingDate !== 'string' ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(row.accountingDate) ||
    new Date(row.accountingDate + 'T00:00:00.000Z').toISOString().slice(0, 10) !==
      row.accountingDate
  )
    throw Error('QA_PROFILE_INVALID');
  new Intl.DateTimeFormat('en', { timeZone: row.timeZone }).format();
  if (
    !Array.isArray(row.reservedSequences) ||
    row.reservedSequences.length > 1000 ||
    row.reservedSequences.some((item) => !Number.isInteger(item) || item < 1 || item > 999999) ||
    new Set(row.reservedSequences).size !== row.reservedSequences.length
  )
    throw Error('QA_PROFILE_INVALID');
  if (!isRecord(row.fixedFields) || !keys(row.fixedFields, fixedNumbers.map(String)))
    throw Error('QA_PROFILE_INVALID');
  const fixedRow = row.fixedFields;
  const fixedFields = new Map(
    fixedNumbers.map((number) => [number, bytes(fixedRow[String(number)])]),
  );
  const widths = new Map([
    [18, 2],
    [19, 2],
    [22, 2],
    [25, 1],
    [28, 9],
    [42, 15],
    [43, 40],
    [49, 2],
    [53, 8],
  ]);
  for (const [field, width] of widths) {
    if (fixedFields.get(field)?.length !== width) throw Error('QA_PROFILE_INVALID');
  }
  for (const [field, maximum] of [
    [32, 11],
    [48, 255],
    [60, 7],
    [62, 255],
  ]) {
    const value = fixedFields.get(field!)!;
    const length = value[0]!;
    if (
      !length ||
      length > maximum! ||
      value.length !== 1 + (field === 32 ? Math.ceil(length / 2) : length)
    )
      throw Error('QA_PROFILE_INVALID');
  }
  if (!fixedFields.get(49)!.equals(Buffer.from('0840', 'hex'))) throw Error('QA_PROFILE_INVALID');
  if (
    !isRecord(row.emv) ||
    !keys(row.emv, [
      'parameters',
      'countryCode',
      'transactionType',
      'applicationVersion',
      'issuerUsage',
      'extraTags',
      'field55Tags',
    ]) ||
    !isRecord(row.emv.parameters) ||
    typeof row.emv.countryCode !== 'string' ||
    row.emv.countryCode !== '218' ||
    row.emv.transactionType !== '30' ||
    typeof row.emv.applicationVersion !== 'string' ||
    !/^[A-F0-9]{4}$/.test(row.emv.applicationVersion) ||
    row.emv.issuerUsage !== 'SERVICES' ||
    !isRecord(row.emv.extraTags) ||
    !Array.isArray(row.emv.field55Tags) ||
    row.emv.field55Tags.length > 24 ||
    new Set(row.emv.field55Tags).size !== row.emv.field55Tags.length ||
    row.emv.field55Tags.some((tag) => typeof tag !== 'string' || !allowedTags.has(tag)) ||
    ['9F26', '9F27', '9F36', '95', '9A', '9C', '9F02', '5F2A', '9F37'].some(
      (tag) =>
        !(row.emv as Record<string, unknown>).field55Tags ||
        !((row.emv as Record<string, unknown>).field55Tags as string[]).includes(tag),
    )
  )
    throw Error('QA_PROFILE_INVALID');
  const extraTags = new Map(
    Object.entries(row.emv.extraTags).map(([tag, value]) => {
      if (!['9F1E', '84', '9F06', '9F1D', '9F53', '9F39'].includes(tag))
        throw Error('QA_PROFILE_INVALID');
      return [tag, bytes(value)] as const;
    }),
  );
  const parameters = parseQaEmvTerminalParameters(row.emv.parameters);
  const header = bytes(row.header, 22);
  if (
    header[0] !== 22 ||
    parameters.terminalCapabilities !== '604020' ||
    (extraTags.has('84') &&
      !Buffer.from(extraTags.get('84')!).equals(Buffer.from(row.applicationId, 'hex'))) ||
    (extraTags.has('9F06') &&
      !Buffer.from(extraTags.get('9F06')!).equals(Buffer.from(row.applicationId, 'hex')))
  )
    throw Error('QA_PROFILE_INVALID');
  return {
    id: row.id,
    atmId: row.atmId,
    atmRevision: row.atmRevision,
    terminalId: row.terminalId,
    endpoint: { host: row.endpoint.host, port: Number(row.endpoint.port) },
    keyReference: row.keyReference,
    applicationId: row.applicationId,
    cardBin: row.cardBin,
    approvalReference: row.approvalReference,
    timeZone: row.timeZone,
    accountingDate: row.accountingDate,
    header,
    extension: bytes(row.extension, 2),
    fixedFields,
    emv: {
      parameters,
      countryCode: row.emv.countryCode,
      transactionType: row.emv.transactionType,
      applicationVersion: row.emv.applicationVersion,
      issuerUsage: row.emv.issuerUsage,
      extraTags,
      field55Tags: row.emv.field55Tags as string[],
    },
  };
}

export function parseQaExecutionProfileFile(input: unknown): {
  file: QaExecutionProfileFile;
  profiles: QaExecutionProfile[];
} {
  if (
    !isRecord(input) ||
    !keys(input, ['version', 'profiles']) ||
    input.version !== 1 ||
    !Array.isArray(input.profiles) ||
    input.profiles.length > 50 ||
    input.profiles.some((row) => !isRecord(row))
  )
    throw Error('QA_PROFILE_INVALID');
  const profiles = (input.profiles as Record<string, unknown>[]).map(profile);
  if (
    new Set(profiles.map((row) => row.id)).size !== profiles.length ||
    new Set(profiles.map((row) => row.atmId)).size !== profiles.length ||
    new Set(profiles.map((row) => row.terminalId)).size !== profiles.length
  )
    throw Error('QA_PROFILE_INVALID');
  // STAN and the derived RRN are shared by this QA origin. A sequence may
  // belong to only one terminal's remaining reservation pool.
  const reserved = (input.profiles as Record<string, unknown>[]).flatMap(
    (row) => row.reservedSequences as number[],
  );
  if (new Set(reserved).size !== reserved.length) throw Error('QA_PROFILE_INVALID');
  return { file: { version: 1, profiles: input.profiles as Record<string, unknown>[] }, profiles };
}

export function qaExecutionProfileIdentity(profile: QaExecutionProfile): string {
  return JSON.stringify({
    ...profile,
    fixedFields: [...profile.fixedFields],
    emv: { ...profile.emv, extraTags: [...profile.emv.extraTags] },
  });
}

export class FileQaExecutionProfiles {
  constructor(private readonly path: string) {}
  async read(): Promise<ReturnType<typeof parseQaExecutionProfileFile>> {
    const file = await open(this.path, 'r');
    try {
      const buffer = Buffer.alloc(65537);
      let bytesRead = 0;
      while (bytesRead < buffer.length) {
        const chunk = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
        if (!chunk.bytesRead) break;
        bytesRead += chunk.bytesRead;
      }
      if (bytesRead > 65536) throw Error('QA_PROFILE_INVALID');
      return parseQaExecutionProfileFile(
        JSON.parse(buffer.toString('utf8', 0, bytesRead).replace(/^\uFEFF/, '')),
      );
    } finally {
      await file.close();
    }
  }
  async reserve(id: string, signal: AbortSignal, expected?: string): Promise<number> {
    // Consume an explicitly provisioned pool; never infer a host SP, increment
    // a live ATM serial, or invent a STAN rollover. One local process/file lock.
    const lock = await open(this.path + '.lock', 'wx');
    const temp = this.path + '.' + randomUUID() + '.tmp';
    let created = false;
    try {
      const state = await this.read();
      const current = state.profiles.find((item) => item.id === id);
      if (!current || (expected && qaExecutionProfileIdentity(current) !== expected))
        throw Error('QA_PROFILE_CHANGED');
      const row = state.file.profiles.find((item) => item.id === id);
      const sequence = (row?.reservedSequences as number[] | undefined)?.shift();
      if (sequence === undefined || signal.aborted) throw Error('QA_SEQUENCE_UNAVAILABLE');
      const output = await open(temp, 'wx');
      created = true;
      try {
        await output.writeFile(JSON.stringify(state.file));
        await output.sync();
      } finally {
        await output.close();
      }
      if (signal.aborted) throw Error('QA_SEQUENCE_UNAVAILABLE');
      await rename(temp, this.path);
      created = false;
      return sequence;
    } finally {
      if (created) await unlink(temp).catch(() => undefined);
      await lock.close();
      await unlink(this.path + '.lock');
    }
  }
}
