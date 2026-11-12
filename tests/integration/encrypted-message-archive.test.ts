import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EncryptedMessageArchive } from '../../apps/desktop/src/main/infrastructure/encrypted-message-archive';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import type { SessionIsoMessage } from '../../packages/shared/src/session-messages';
import { capturedBalanceRequest } from '../helpers/captured-visa-balance';
import { testMessageEncryption } from '../helpers/message-encryption';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-message-archive-'));
});
afterEach(async () => {
  vi.useRealTimers();
  await removeTestDirectory(directory, 'coonecta-message-archive-');
});
const message = () => new CapturedVisaBalance().sessionMessage(capturedBalanceRequest());

describe('archivo cifrado de mensajes QA', () => {
  it('conserva los cuatro MTI tras cerrar/reabrir, más de 15 minutos y más de 20 operaciones', async () => {
    const encryption = testMessageEncryption();
    const archive = new EncryptedMessageArchive(directory, encryption);
    const requestId = randomUUID();
    const original = message();
    for (const mti of ['0200', '0210', '0420', '0430'] as const)
      archive.capture(requestId, { ...original, mti });
    for (let i = 0; i < 25; i++) archive.capture(randomUUID(), original);
    // Mutating the caller's DTO must not affect pending writes.
    original.fields[0]!.value = 'MUTATED';
    await archive.close();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60 * 1000);
    const reopened = new EncryptedMessageArchive(directory, encryption);
    const restored = await reopened.read(requestId);
    clock.mockRestore();
    expect(restored?.expiresAt).toBeNull();
    expect(Object.keys(restored!.messages)).toEqual(['0200', '0210', '0420', '0430']);
    expect(JSON.stringify(restored!.messages['0200']) === JSON.stringify(message())).toBe(true);
    reopened.clear();
    expect(await reopened.read(requestId)).not.toBeNull();
    const files = await readdir(join(directory, requestId));
    expect(files).toHaveLength(4);
    const secret = message().fields.find((field) => field.number === 2)!.value;
    for (const file of files) {
      const bytes = await readFile(join(directory, requestId, file));
      expect(bytes.includes(Buffer.from(secret))).toBe(false);
      expect(bytes.includes(Buffer.from('UNMASKED_QA_SESSION'))).toBe(false);
    }
    await reopened.close();
  });

  it('preserva solicitudes sin respuesta y nunca rellena registros antiguos o de otra operación', async () => {
    const archive = new EncryptedMessageArchive(directory, testMessageEncryption());
    const requestId = randomUUID();
    archive.capture(requestId, message());
    const result = await archive.read(requestId);
    expect(Object.keys(result!.messages)).toEqual(['0200']);
    expect(await archive.read(randomUUID())).toBeNull();
    await archive.close();
  });

  it('una escritura pendiente no bloquea la consulta de otra operación', async () => {
    const encryption = testMessageEncryption();
    const encrypt = encryption.encrypt.bind(encryption);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(encryption, 'encrypt').mockImplementationOnce(async (value) => {
      await gate;
      return encrypt(value);
    });
    const archive = new EncryptedMessageArchive(directory, encryption);
    const slow = randomUUID();
    const ready = randomUUID();
    archive.capture(slow, message());
    archive.capture(ready, message());
    try {
      expect(await archive.read(ready)).not.toBeNull();
    } finally {
      release();
      await archive.close();
    }
    expect(await archive.read(slow)).not.toBeNull();
  });

  it('rechaza referencias, DTO, tamaños, sustitución entre operaciones y contenido corrupto', async () => {
    const encryption = testMessageEncryption();
    const archive = new EncryptedMessageArchive(directory, encryption);
    archive.capture('../outside', message());
    await expect(archive.read('../outside')).rejects.toThrow('MESSAGE_ARCHIVE_REFERENCE_INVALID');
    expect(await readdir(directory)).toEqual([]);
    for (const invalid of [
      { ...message(), extra: 'not allowed' },
      { ...message(), visibility: 'PUBLIC' },
      { ...message(), fields: [{ number: 2, value: 'x'.repeat(256 * 1024) }] },
      {
        ...message(),
        fields: [
          { number: 2, value: 'a' },
          { number: 2, value: 'b' },
        ],
      },
    ]) {
      const requestId = randomUUID();
      archive.capture(requestId, invalid as SessionIsoMessage);
      await expect(archive.read(requestId)).rejects.toThrow('MESSAGE_ARCHIVE_WRITE_FAILED');
    }
    const first = randomUUID();
    const second = randomUUID();
    archive.capture(first, message());
    archive.capture(second, message());
    await archive.close();
    await copyFile(join(directory, first, '0200.iso.enc'), join(directory, second, '0200.iso.enc'));
    const reopened = new EncryptedMessageArchive(directory, encryption);
    await expect(reopened.read(second)).rejects.toThrow('MESSAGE_ARCHIVE_UNAVAILABLE');
    await writeFile(join(directory, first, '0200.iso.enc'), 'corrupt');
    await expect(reopened.read(first)).rejects.toThrow('MESSAGE_ARCHIVE_UNAVAILABLE');
    await reopened.close();
  });

  it('no escribe texto claro cuando falla el cifrado o el almacenamiento y permite otras operaciones', async () => {
    const encryption = testMessageEncryption();
    const encrypt = vi.spyOn(encryption, 'encrypt').mockRejectedValueOnce(Error('PRIVATE_FAILURE'));
    const archive = new EncryptedMessageArchive(directory, encryption);
    const failed = randomUUID();
    archive.capture(failed, message());
    await expect(archive.read(failed)).rejects.toThrow('MESSAGE_ARCHIVE_WRITE_FAILED');
    expect(await readdir(directory)).toEqual([]);
    const blocked = randomUUID();
    await writeFile(join(directory, blocked), 'not a directory');
    archive.capture(blocked, message());
    await expect(archive.read(blocked)).rejects.toThrow('MESSAGE_ARCHIVE_WRITE_FAILED');
    const succeeding = randomUUID();
    archive.capture(succeeding, message());
    expect(await archive.read(succeeding)).not.toBeNull();
    expect(encrypt).toHaveBeenCalledTimes(3);
    await archive.close();
    const wrongUser = new EncryptedMessageArchive(directory, testMessageEncryption());
    await expect(wrongUser.read(succeeding)).rejects.toThrow('MESSAGE_ARCHIVE_UNAVAILABLE');
    await wrongUser.close();
  });

  it('acota una dependencia de cifrado que no responde sin escribir ni propagar su fallo al envío', async () => {
    vi.useFakeTimers();
    const encryption = testMessageEncryption();
    vi.spyOn(encryption, 'encrypt').mockImplementation(() => new Promise(() => undefined));
    const archive = new EncryptedMessageArchive(directory, encryption, 50);
    const requestId = randomUUID();
    expect(() => archive.capture(requestId, message())).not.toThrow();
    const result = expect(archive.read(requestId)).rejects.toThrow('MESSAGE_ARCHIVE_WRITE_FAILED');
    await vi.advanceTimersByTimeAsync(50);
    await result;
    await archive.close();
    expect(await readdir(directory)).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
