import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isRecord } from '../../../../../packages/domain/src/index';
import { isUuid, isUtcTimestamp } from '../../../../../packages/domain/src/catalogs';
import { parseLoadTestDraft } from '../../../../../packages/domain/src/load-test';
import type { LoadRunSnapshot } from '../../../../../packages/domain/src/load-run';
import type { LoadRunStore } from '../load-run-service';

export function validLoadRunSnapshot(value: unknown): value is LoadRunSnapshot {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 10 ||
    !isUuid(value.runId) ||
    !isUuid(value.requestId) ||
    !parseLoadTestDraft(value.draft) ||
    !isUtcTimestamp(value.startedAt) ||
    !(value.finishedAt === null || isUtcTimestamp(value.finishedAt)) ||
    !['RUNNING', 'STOPPING', 'COMPLETED', 'STOPPED', 'FAILED', 'INTERRUPTED'].includes(
      String(value.state),
    ) ||
    typeof value.message !== 'string' ||
    value.message.length > 500 ||
    /\d{12}/.test(value.message) ||
    typeof value.elapsedMs !== 'number' ||
    !Number.isFinite(value.elapsedMs) ||
    value.elapsedMs < 0 ||
    typeof value.active !== 'number' ||
    ![0, 1].includes(value.active) ||
    !Array.isArray(value.items) ||
    value.items.length > 100
  )
    return false;
  return value.items.every((item: unknown) => {
    if (
      !isRecord(item) ||
      Object.keys(item).length < 8 ||
      Object.keys(item).length > 11 ||
      Object.keys(item).some(
        (key) =>
          ![
            'requestId',
            'transactionId',
            'outcome',
            'sent',
            'received',
            'elapsedMs',
            'responseCode',
            'correlation',
            'finishedAt',
            'finishedElapsedMs',
            'timings',
          ].includes(key),
      ) ||
      !isUuid(item.requestId) ||
      !(item.transactionId === null || isUuid(item.transactionId)) ||
      ![
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
      ].includes(String(item.outcome)) ||
      typeof item.sent !== 'boolean' ||
      typeof item.received !== 'boolean' ||
      typeof item.elapsedMs !== 'number' ||
      !Number.isFinite(item.elapsedMs) ||
      item.elapsedMs < 0 ||
      !(
        item.responseCode === null ||
        (typeof item.responseCode === 'string' && /^[A-Z0-9]{2}$/.test(item.responseCode))
      )
    )
      return false;
    const phases = [
      'cardReadMs',
      'inspectMs',
      'contextMs',
      'validationMs',
      'journalMs',
      'transportMs',
      'otherMs',
      'totalMs',
    ];
    if (item.finishedAt !== undefined && !isUtcTimestamp(item.finishedAt)) return false;
    if (
      item.finishedElapsedMs !== undefined &&
      (!Number.isSafeInteger(item.finishedElapsedMs) || (item.finishedElapsedMs as number) < 0)
    )
      return false;
    if (item.timings !== undefined) {
      if (!isRecord(item.timings) || Object.keys(item.timings).length !== phases.length)
        return false;
      const timings = item.timings;
      if (
        !phases.every(
          (phase) =>
            Number.isSafeInteger(timings[phase]) &&
            (timings[phase] as number) >= 0 &&
            (timings[phase] as number) <= 300000,
        )
      )
        return false;
    }
    return (
      item.correlation === null ||
      (isRecord(item.correlation) &&
        Object.keys(item.correlation).length === 3 &&
        typeof item.correlation.stan === 'string' &&
        /^\d{6}$/.test(item.correlation.stan) &&
        typeof item.correlation.rrn === 'string' &&
        /^\d{12}$/.test(item.correlation.rrn) &&
        typeof item.correlation.terminalId === 'string' &&
        /^[A-Z0-9]{8}$/.test(item.correlation.terminalId))
    );
  });
}
export async function readLegacyLoadRuns(file: string): Promise<LoadRunSnapshot[]> {
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (bytes.length > 4 * 1024 * 1024) throw Error('LOAD_STORE_LIMIT');
  const value: unknown = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(value) || value.length > 100 || !value.every(validLoadRunSnapshot))
    throw Error('LOAD_STORE_INVALID');
  const runIds = new Set(value.map((run) => run.runId));
  const requestIds = new Set(value.map((run) => run.requestId));
  if (runIds.size !== value.length || requestIds.size !== value.length)
    throw Error('LOAD_STORE_INVALID');
  return value;
}
export class FileLoadRunStore implements LoadRunStore {
  constructor(private readonly file: string) {}
  private async all(): Promise<LoadRunSnapshot[]> {
    return readLegacyLoadRuns(this.file);
  }
  async read(): Promise<LoadRunSnapshot | null> {
    return (await this.all()).at(-1) ?? null;
  }
  async hasRequest(id: string): Promise<boolean> {
    return (await this.all()).some((item) => item.requestId === id);
  }
  async write(run: LoadRunSnapshot): Promise<void> {
    if (!validLoadRunSnapshot(run)) throw Error('LOAD_RUN_INVALID');
    const runs = await this.all();
    const index = runs.findIndex((item) => item.runId === run.runId);
    if (index < 0) {
      if (runs.some((item) => item.requestId === run.requestId))
        throw Error('LOAD_RUN_DUPLICATE_REQUEST');
      if (runs.length >= 100) throw Error('LOAD_STORE_FULL');
      runs.push(run);
    } else {
      if (runs[index]!.requestId !== run.requestId) throw Error('LOAD_RUN_INVALID');
      runs[index] = run;
    }
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    const serialized = JSON.stringify(runs);
    if (Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw Error('LOAD_STORE_LIMIT');
    await mkdir(dirname(this.file), { recursive: true });
    try {
      await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
      await rename(temporary, this.file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
