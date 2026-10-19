import { mkdir, open, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isRecord } from '../../../../../packages/domain/src/index';
import { isUtcTimestamp, isUuid, isRevision } from '../../../../../packages/domain/src/catalogs';
import type { BalanceExecution } from '../../../../../packages/domain/src/balance-inquiry';
import {
  parseBalanceDiagnostics,
  hasWithdrawalQaContinuation,
} from '../../../../../packages/domain/src/balance-inquiry';
import type { BalanceJournal } from '../balance-ports';
import { parseWithdrawalDetails } from '../../../../../packages/domain/src/withdrawal';
import { parseWithdrawalReversal } from '../../../../../packages/domain/src/withdrawal-reversal';

const outcomes = [
  'PENDING',
  'BLOCKED',
  'APPROVED',
  'NOT_APPROVED',
  'REQUIRES_REVIEW',
  'INVALID_RESPONSE',
  'CONNECT_TIMEOUT',
  'RESPONSE_TIMEOUT',
  'PEER_CLOSED',
  'TRANSPORT_ERROR',
  'CONTEXT_ERROR',
  'STORAGE_ERROR',
];
const keys = [
  'requestId',
  'runId',
  'transactionId',
  'environment',
  'atmId',
  'atmRevision',
  'configurationRevision',
  'cardReadId',
  'startedAt',
  'scenario',
  'finishedAt',
  'outcome',
  'frameGenerated',
  'transmissionAttempted',
  'bytesQueued',
  'elapsedMs',
  'correlation',
  'responseCode',
  'balances',
  'blockers',
];
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}
export function parseBalanceJournal(value: unknown): BalanceExecution[] | undefined {
  if (
    !exact(value, ['version', 'executions']) ||
    value.version !== 1 ||
    !Array.isArray(value.executions) ||
    value.executions.length > 200
  )
    return undefined;
  const requests = new Set<string>();
  for (const item of value.executions) {
    if (
      !exact(item, [
        ...keys,
        ...(isRecord(item) && Object.hasOwn(item, 'diagnostics') ? ['diagnostics'] : []),
        ...(isRecord(item) && Object.hasOwn(item, 'withdrawal') ? ['withdrawal'] : []),
        ...(isRecord(item) && Object.hasOwn(item, 'reversal') ? ['reversal'] : []),
        ...(isRecord(item) && Object.hasOwn(item, 'qaContinuation') ? ['qaContinuation'] : []),
      ]) ||
      (item.diagnostics !== undefined && !parseBalanceDiagnostics(item.diagnostics)) ||
      (Object.hasOwn(item, 'withdrawal') && !parseWithdrawalDetails(item.withdrawal)) ||
      (Object.hasOwn(item, 'reversal') &&
        (!item.withdrawal || !parseWithdrawalReversal(item.reversal))) ||
      !['requestId', 'runId', 'transactionId', 'atmId', 'cardReadId'].every((key) =>
        isUuid(item[key]),
      ) ||
      item.environment !== 'QA' ||
      !isRevision(item.atmRevision) ||
      !isRevision(item.configurationRevision) ||
      !['LOCAL', 'RTC', 'BANRED', 'EXTERNAL'].includes(String(item.scenario)) ||
      !isUtcTimestamp(item.startedAt) ||
      !(item.finishedAt === null || isUtcTimestamp(item.finishedAt)) ||
      !outcomes.includes(String(item.outcome)) ||
      typeof item.frameGenerated !== 'boolean' ||
      typeof item.transmissionAttempted !== 'boolean' ||
      ![item.bytesQueued, item.elapsedMs].every(
        (number) => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0,
      ) ||
      !(
        item.responseCode === null ||
        (typeof item.responseCode === 'string' && /^\d{2}$/.test(item.responseCode))
      ) ||
      !Array.isArray(item.balances) ||
      item.balances.length > 6 ||
      !Array.isArray(item.blockers) ||
      item.blockers.length > 20 ||
      requests.has(String(item.requestId))
    )
      return undefined;
    if (
      item.reversal !== undefined &&
      (!isRecord(item.withdrawal) ||
        item.withdrawal.transaction !== 'WITHDRAWAL_APPROVED' ||
        !isRecord(item.reversal) ||
        (['WAITING', 'SENDING', 'APPROVED', 'NOT_APPROVED', 'UNCONFIRMED'].includes(
          String(item.reversal.outcome),
        ) &&
          item.outcome !== 'APPROVED'))
    )
      return undefined;
    if (
      item.withdrawal !== undefined &&
      ((item.outcome !== 'APPROVED' && item.balances.length !== 0) ||
        (item.outcome === 'NOT_APPROVED' &&
          (item.responseCode !== '91' ||
            item.finishedAt === null ||
            item.correlation === null ||
            !item.transmissionAttempted ||
            item.bytesQueued === 0)) ||
        (item.outcome === 'APPROVED' && item.responseCode !== '00'))
    )
      return undefined;
    if (
      item.correlation !== null &&
      (!exact(item.correlation, ['stan', 'rrn', 'terminalId']) ||
        typeof item.correlation.stan !== 'string' ||
        !/^\d{6}$/.test(item.correlation.stan) ||
        typeof item.correlation.rrn !== 'string' ||
        !/^\d{12}$/.test(item.correlation.rrn) ||
        typeof item.correlation.terminalId !== 'string' ||
        !/^[A-Z0-9]{8}$/.test(item.correlation.terminalId))
    )
      return undefined;
    for (const balance of item.balances)
      if (
        !exact(balance, ['accountCode', 'type', 'currency', 'amount']) ||
        balance.accountCode !== '10' ||
        !['01', '02', '91'].includes(String(balance.type)) ||
        balance.currency !== '840' ||
        typeof balance.amount !== 'string' ||
        !/^-?(0|[1-9]\d{0,9})\.\d{2}$/.test(balance.amount)
      )
        return undefined;
    for (const blocker of item.blockers)
      if (
        !exact(blocker, ['id', 'label']) ||
        typeof blocker.id !== 'string' ||
        !/^[A-Z][A-Z0-9_-]{0,63}$/.test(blocker.id) ||
        typeof blocker.label !== 'string' ||
        blocker.label.length > 200 ||
        /\d{12}/.test(blocker.label) ||
        Array.from(blocker.label).some(
          (letter) => letter.charCodeAt(0) < 32 || letter.charCodeAt(0) === 127,
        )
      )
        return undefined;
    requests.add(String(item.requestId));
    if (
      Object.hasOwn(item, 'qaContinuation') &&
      !hasWithdrawalQaContinuation(item as unknown as BalanceExecution)
    )
      return undefined;
  }
  return structuredClone(value.executions) as BalanceExecution[];
}
// No card payloads, PIN/EMV or RAW. No automatic eviction of idempotency records.
export class FileBalanceJournal implements BalanceJournal {
  private pending: Promise<void> = Promise.resolve();
  // Progress polling must not hold a Windows read handle across atomic rename.
  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  constructor(
    private readonly path: string,
    private readonly operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE',
  ) {}
  private accepts(executions: readonly BalanceExecution[]): boolean {
    return executions.every((item) =>
      this.operation === 'WITHDRAWAL' ? !!item.withdrawal : !item.withdrawal,
    );
  }
  async read(): Promise<BalanceExecution[]> {
    return this.serialize(() => this.readFile());
  }
  private async readFile(): Promise<BalanceExecution[]> {
    let handle;
    try {
      handle = await open(this.path, 'r');
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return [];
      throw new Error('BALANCE_JOURNAL_UNAVAILABLE', { cause: error });
    }
    try {
      if ((await handle.stat()).size > 512 * 1024) throw new Error('BALANCE_JOURNAL_LIMIT');
      const buffer = Buffer.alloc(512 * 1024 + 1);
      let length = 0;
      try {
        while (length < buffer.length) {
          const read = await handle.read(buffer, length, buffer.length - length, null);
          if (!read.bytesRead) break;
          length += read.bytesRead;
        }
        if (length > 512 * 1024) throw new Error('BALANCE_JOURNAL_LIMIT');
        const contents = buffer.subarray(0, length).toString('utf8');
        const parsed = parseBalanceJournal(JSON.parse(contents));
        if (!parsed || !this.accepts(parsed)) throw new Error('BALANCE_JOURNAL_INVALID');
        return parsed;
      } finally {
        buffer.fill(0);
      }
    } finally {
      await handle.close();
    }
  }
  async write(executions: readonly BalanceExecution[]): Promise<void> {
    const snapshot = structuredClone(executions);
    return this.serialize(() => this.writeFile(snapshot));
  }
  private async writeFile(executions: readonly BalanceExecution[]): Promise<void> {
    const document = { version: 1, executions };
    if (!parseBalanceJournal(document) || !this.accepts(executions))
      throw new Error('BALANCE_JOURNAL_INVALID');
    const contents = JSON.stringify(document);
    if (Buffer.byteLength(contents) > 512 * 1024) throw new Error('BALANCE_JOURNAL_LIMIT');
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, contents, { flag: 'wx' });
      await rename(temporary, this.path);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
}
