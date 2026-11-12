import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { MessageEncryptionPort } from '../../apps/desktop/src/main/session-message-port';

// Ephemeral synthetic key for archive tests. Desktop/E2E uses Windows safeStorage.
export function testMessageEncryption(): MessageEncryptionPort {
  const key = randomBytes(32);
  return {
    async encrypt(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    async decrypt(value) {
      const bytes = Buffer.from(value);
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(
        'utf8',
      );
    },
  };
}
