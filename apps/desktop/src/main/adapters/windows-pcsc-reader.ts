import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type {
  CardReaderAdapter,
  CardReaderSnapshot,
  ReaderDevice,
} from '../../../../../packages/domain/src/card-reader';
import type { Result } from '../../../../../packages/shared/src/contracts';
import { failure } from '../../../../../packages/shared/src/contracts';

export function decodeReaderStatus(text: string, checkedAt: string): CardReaderSnapshot {
  try {
    return parseReaderStatus(text, checkedAt);
  } catch {
    throw Error('PCSC_RESPONSE_INVALID');
  }
}

function parseReaderStatus(text: string, checkedAt: string): CardReaderSnapshot {
  if (text.length > 16384) throw Error('PCSC_RESPONSE_INVALID');
  const value = JSON.parse(text) as { ok?: unknown; readers?: unknown };
  if (value.ok !== true || !Array.isArray(value.readers) || value.readers.length > 16)
    throw Error('PCSC_RESPONSE_INVALID');
  const readers: ReaderDevice[] = value.readers.map((row: unknown) => {
    if (!row || typeof row !== 'object') throw Error('PCSC_RESPONSE_INVALID');
    const item = row as Record<string, unknown>;
    if (
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 160 ||
      [...item.name].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      !['CARD_PRESENT', 'EMPTY', 'UNAVAILABLE'].includes(String(item.state)) ||
      (item.atr !== null &&
        (typeof item.atr !== 'string' || !/^(?:[A-F0-9]{2}){1,36}$/.test(item.atr))) ||
      (item.state !== 'CARD_PRESENT' && item.atr !== null)
    )
      throw Error('PCSC_RESPONSE_INVALID');
    return {
      name: item.name.replace(/\d{12,19}/g, '[PROTEGIDO]'),
      state: item.state as ReaderDevice['state'],
      atr: item.atr as string | null,
    };
  });
  return { checkedAt, readers, identityStatus: 'NOT_READ' };
}

export class WindowsPcscReader implements CardReaderAdapter {
  private pending: Promise<CardReaderSnapshot> | undefined;
  private cancel: (() => void) | undefined;
  private closed = false;
  constructor(
    private readonly script: string,
    private readonly timeoutMs = 8000,
    private readonly platform = process.platform,
    private readonly runtime = process.env.SystemRoot ?? 'C:\\Windows',
  ) {}

  inspect(): Promise<CardReaderSnapshot> {
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }

  close(): void {
    this.closed = true;
    this.cancel?.();
  }

  private async read(): Promise<CardReaderSnapshot> {
    if (this.platform !== 'win32' || this.closed) throw Error('PCSC_UNAVAILABLE');
    return new Promise((resolve, reject) => {
      const process = spawn(
        join(this.runtime, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', this.script],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let output = '',
        done = false;
      const fail = (code: string) => {
        if (done) return;
        done = true;
        this.cancel = undefined;
        clearTimeout(timer);
        output = '';
        process.kill();
        reject(Error(code));
      };
      const timer = setTimeout(() => fail('PCSC_TIMEOUT'), this.timeoutMs);
      this.cancel = () => fail('PCSC_UNAVAILABLE');
      process.once('error', () => fail('PCSC_UNAVAILABLE'));
      process.stdout.setEncoding('utf8');
      process.stdout.on('data', (chunk: string) => {
        if (done) return;
        output += chunk;
        if (output.length > 16384) fail('PCSC_RESPONSE_INVALID');
      });
      process.once('close', (code) => {
        if (done) return;
        clearTimeout(timer);
        done = true;
        this.cancel = undefined;
        try {
          if (code !== 0) throw Error('PCSC_UNAVAILABLE');
          resolve(decodeReaderStatus(output, new Date().toISOString()));
        } catch {
          reject(Error('PCSC_UNAVAILABLE'));
        } finally {
          output = '';
        }
      });
    });
  }
}

export async function inspectReader(
  adapter: CardReaderAdapter,
  payload: unknown,
): Promise<Result<CardReaderSnapshot>> {
  if (payload !== undefined) return failure('VALIDATION_ERROR', 'Solicitud de lector inválida.');
  try {
    return { ok: true, value: await adapter.inspect() };
  } catch (error) {
    return error instanceof Error && error.message === 'PCSC_TIMEOUT'
      ? failure('TIMEOUT', 'El lector no respondió a tiempo. Revisa su conexión.')
      : failure(
          'SERVICE_UNAVAILABLE',
          'No se pudo consultar PC/SC. Revisa el lector y el servicio.',
        );
  }
}
