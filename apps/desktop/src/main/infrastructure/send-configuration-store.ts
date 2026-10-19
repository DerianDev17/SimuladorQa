import { open, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSendConfigurationFile } from '../../../../../packages/domain/src/send-configuration';
import type { SendConfigurationFile } from '../../../../../packages/domain/src/send-configuration';
import type { SendConfigurationStore } from '../send-configuration-port';

export class FileSendConfigurationStore implements SendConfigurationStore {
  constructor(private readonly file: string) {}
  async read(): Promise<SendConfigurationFile> {
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(this.file, 'r');
      const buffer = Buffer.alloc(262145);
      let used = 0;
      while (used < buffer.length) {
        const result = await handle.read(buffer, used, buffer.length - used, null);
        if (!result.bytesRead) break;
        used += result.bytesRead;
      }
      if (used > 262144) throw Error('INVALID_SEND_CONFIGURATION');
      const value = parseSendConfigurationFile(JSON.parse(buffer.toString('utf8', 0, used)));
      if (!value) throw Error('INVALID_SEND_CONFIGURATION');
      return value;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        return { version: 1, configurations: [], audit: [] };
      throw Error('STORAGE_UNAVAILABLE', { cause: error });
    } finally {
      await handle?.close();
    }
  }
  async write(configuration: SendConfigurationFile): Promise<void> {
    if (!parseSendConfigurationFile(configuration)) throw Error('INVALID_SEND_CONFIGURATION');
    const temporary = this.file + '.' + randomUUID() + '.tmp';
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temporary, JSON.stringify(configuration) + '\n', {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporary, this.file);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
