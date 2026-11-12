import { safeStorage } from 'electron';
import type { MessageEncryptionPort } from '../session-message-port';

// Windows station: DPAPI-backed Electron storage, with no plaintext fallback.
// Kept behind a port so storage tests never need a user's encryption keys.
export class ElectronMessageEncryption implements MessageEncryptionPort {
  private async ready(): Promise<void> {
    if (process.platform !== 'win32' || !(await safeStorage.isAsyncEncryptionAvailable()))
      throw Error('MESSAGE_ENCRYPTION_UNAVAILABLE');
  }

  async encrypt(value: string): Promise<Uint8Array> {
    await this.ready();
    return safeStorage.encryptStringAsync(value);
  }

  async decrypt(value: Uint8Array): Promise<string> {
    await this.ready();
    return (await safeStorage.decryptStringAsync(Buffer.from(value))).result;
  }
}
