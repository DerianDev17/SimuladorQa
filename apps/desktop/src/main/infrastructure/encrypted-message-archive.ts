import { randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { isUuid } from '../../../../../packages/domain/src/catalogs';
import { isRecord } from '../../../../../packages/domain/src/index';
import type {
  SessionIsoMessage,
  SessionMessages,
} from '../../../../../packages/shared/src/session-messages';
import type { MessageEncryptionPort, SessionMessagePort } from '../session-message-port';

const messageTypes = ['0200', '0210', '0420', '0430'] as const;
const maxPlaintextBytes = 256 * 1024;
const maxEncryptedBytes = 512 * 1024;

function isMessage(value: unknown): value is SessionIsoMessage {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 3 ||
    value.visibility !== 'UNMASKED_QA_SESSION' ||
    !messageTypes.some((mti) => mti === value.mti) ||
    !Array.isArray(value.fields) ||
    !value.fields.length ||
    value.fields.length > 127
  )
    return false;
  let previous = 1;
  return value.fields.every((field: unknown) => {
    if (
      !isRecord(field) ||
      Object.keys(field).length !== (Object.hasOwn(field, 'tags') ? 3 : 2) ||
      typeof field.number !== 'number' ||
      !Number.isInteger(field.number) ||
      field.number <= previous ||
      field.number > 128 ||
      typeof field.value !== 'string' ||
      field.value.length > maxPlaintextBytes
    )
      return false;
    previous = field.number;
    if (!Object.hasOwn(field, 'tags')) return true;
    if (
      field.number !== 55 ||
      !Array.isArray(field.tags) ||
      !field.tags.length ||
      field.tags.length > 64
    )
      return false;
    const seen = new Set<string>();
    return field.tags.every((tag: unknown) => {
      if (
        !isRecord(tag) ||
        Object.keys(tag).length !== 2 ||
        typeof tag.tag !== 'string' ||
        !/^(?:[A-F0-9]{2}){1,3}$/.test(tag.tag) ||
        seen.has(tag.tag) ||
        typeof tag.value !== 'string' ||
        tag.value.length > maxPlaintextBytes
      )
        return false;
      seen.add(tag.tag);
      return true;
    });
  });
}

// No plaintext files/cache, TTL, or history eviction. Each message is encrypted
// independently and atomically replaced, so partial exchanges survive restart.
export class EncryptedMessageArchive implements SessionMessagePort {
  private readonly pending = new Map<string, Promise<void>>();
  private queued = 0;
  private closed = false;
  private readonly failed = new Set<string>();

  constructor(
    private readonly directory: string,
    private readonly encryption: MessageEncryptionPort,
    private readonly encryptionDeadlineMs = 5000,
  ) {}

  private async crypt<T>(operation: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(Error('MESSAGE_ENCRYPTION_TIMEOUT')),
            this.encryptionDeadlineMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  capture(requestId: string, message: SessionIsoMessage): void {
    if (!isUuid(requestId)) return;
    if (this.closed || this.queued >= 128 || !isMessage(message)) {
      this.failed.add(requestId);
      return;
    }
    const payload = JSON.stringify({ version: 1, environment: 'QA', requestId, message });
    if (Buffer.byteLength(payload) > maxPlaintextBytes) {
      this.failed.add(requestId);
      return;
    }
    const mti = message.mti;
    this.queued++;
    const previous = this.pending.get(requestId) ?? Promise.resolve();
    const writing = previous
      .then(async () => {
        const encrypted = await this.crypt(() => this.encryption.encrypt(payload));
        try {
          if (!encrypted.byteLength || encrypted.byteLength > maxEncryptedBytes)
            throw Error('MESSAGE_ARCHIVE_INVALID');
          await this.write(requestId, mti, encrypted);
        } finally {
          encrypted.fill(0);
        }
      })
      .catch(() => {
        // Never propagate diagnostics into a financial send or log raw errors.
        this.failed.add(requestId);
      })
      .finally(() => {
        this.queued--;
        if (this.pending.get(requestId) === writing) this.pending.delete(requestId);
      });
    this.pending.set(requestId, writing);
  }

  private async write(requestId: string, mti: string, encrypted: Uint8Array): Promise<void> {
    const directory = join(this.directory, requestId);
    const destination = join(directory, `${mti}.iso.enc`);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try {
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(encrypted);
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporary, destination);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  async read(requestId: string): Promise<SessionMessages | null> {
    if (!isUuid(requestId)) throw Error('MESSAGE_ARCHIVE_REFERENCE_INVALID');
    await this.pending.get(requestId);
    if (this.failed.has(requestId)) throw Error('MESSAGE_ARCHIVE_WRITE_FAILED');
    try {
      const messages: SessionMessages['messages'] = {};
      for (const mti of messageTypes) {
        const encrypted = await this.readEncrypted(
          join(this.directory, requestId, `${mti}.iso.enc`),
        );
        if (!encrypted) continue;
        let value: unknown;
        try {
          const plaintext = await this.crypt(() => this.encryption.decrypt(encrypted));
          if (Buffer.byteLength(plaintext) > maxPlaintextBytes)
            throw Error('MESSAGE_ARCHIVE_INVALID');
          value = JSON.parse(plaintext) as unknown;
        } finally {
          encrypted.fill(0);
        }
        if (
          !isRecord(value) ||
          Object.keys(value).length !== 4 ||
          value.version !== 1 ||
          value.environment !== 'QA' ||
          value.requestId !== requestId ||
          !isMessage(value.message) ||
          value.message.mti !== mti
        )
          throw Error('MESSAGE_ARCHIVE_INVALID');
        messages[mti] = value.message;
      }
      return Object.keys(messages).length ? { requestId, expiresAt: null, messages } : null;
    } catch {
      throw Error('MESSAGE_ARCHIVE_UNAVAILABLE');
    }
  }

  private async readEncrypted(path: string): Promise<Buffer | null> {
    let file;
    try {
      file = await open(path, 'r');
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') return null;
      // The outer read boundary replaces dependency errors with a safe code.
      throw error;
    }
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.size < 1 || stat.size > maxEncryptedBytes)
        throw Error('MESSAGE_ARCHIVE_INVALID');
      return await file.readFile();
    } finally {
      await file.close();
    }
  }

  clear(): void {
    // No decrypted cache to release. Environment changes preserve the archive.
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all(this.pending.values());
  }
}
