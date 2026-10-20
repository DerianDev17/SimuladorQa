import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import {
  parseSavedCardProfileFile,
  savedCardProfileLimits,
} from '../../../../../packages/domain/src/saved-card-profiles';
import type { SavedCardProfileFile } from '../../../../../packages/domain/src/saved-card-profiles';

export interface SavedCardProfileStore {
  read(): Promise<SavedCardProfileFile>;
  write(value: SavedCardProfileFile): Promise<void>;
}

export class FileSavedCardProfileStore implements SavedCardProfileStore {
  constructor(private readonly file: string) {}

  async read(): Promise<SavedCardProfileFile> {
    let contents: string;
    try {
      contents = await readFile(this.file, 'utf8');
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        return { version: 2, profiles: [] };
      throw new Error('STORAGE_UNAVAILABLE', { cause: error });
    }
    if (Buffer.byteLength(contents, 'utf8') > savedCardProfileLimits.count * 2048)
      throw new Error('STORAGE_UNAVAILABLE');
    const value = parseSavedCardProfileFile(JSON.parse(contents) as unknown);
    if (!value) throw new Error('STORAGE_UNAVAILABLE');
    return value;
  }

  async write(value: SavedCardProfileFile): Promise<void> {
    if (!parseSavedCardProfileFile(value)) throw new Error('STORAGE_UNAVAILABLE');
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temporary, `${JSON.stringify(value)}\n`, {
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
