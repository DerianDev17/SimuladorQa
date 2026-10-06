import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isEnvironment, isRecord } from '../../../../../packages/domain/src/index';
import type { EnvironmentAudit } from '../../../../../packages/shared/src/contracts';
import type { Preferences, PreferencesStore } from '../ports';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isAudit(value: unknown): value is EnvironmentAudit {
  return (
    isRecord(value) &&
    Object.keys(value).length === 6 &&
    typeof value.id === 'string' &&
    uuidPattern.test(value.id) &&
    typeof value.timestamp === 'string' &&
    !Number.isNaN(Date.parse(value.timestamp)) &&
    new Date(value.timestamp).toISOString() === value.timestamp &&
    isEnvironment(value.environment) &&
    isEnvironment(value.previousEnvironment) &&
    typeof value.user === 'string' &&
    value.user.length <= 256 &&
    typeof value.machine === 'string' &&
    value.machine.length <= 256
  );
}

export class FilePreferencesStore implements PreferencesStore {
  constructor(private readonly file: string) {}

  async read(): Promise<Preferences> {
    let contents: string;
    try {
      contents = await readFile(this.file, 'utf8');
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT')
        return { version: 1, environment: 'QA', audit: [] };
      throw new Error('STORAGE_UNAVAILABLE', { cause: error });
    }
    try {
      const value: unknown = JSON.parse(contents);
      if (
        !isRecord(value) ||
        Object.keys(value).length !== 3 ||
        value.version !== 1 ||
        !isEnvironment(value.environment) ||
        !Array.isArray(value.audit) ||
        value.audit.length > 100 ||
        !value.audit.every(isAudit)
      )
        throw new Error('INVALID_PREFERENCES');
      return {
        version: 1,
        environment: value.environment,
        audit: value.audit as EnvironmentAudit[],
      };
    } catch {
      // Conservar un archivo inválido para diagnóstico; nunca sobrescribirlo en silencio.
      throw new Error('STORAGE_UNAVAILABLE');
    }
  }

  async write(preferences: Preferences): Promise<void> {
    const temporaryFile = `${this.file}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(temporaryFile, `${JSON.stringify(preferences, null, 2)}\n`, {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600,
      });
      await rename(temporaryFile, this.file);
    } finally {
      await rm(temporaryFile, { force: true });
    }
  }
}
