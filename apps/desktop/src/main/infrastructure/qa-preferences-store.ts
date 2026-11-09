import { copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { Preferences, PreferencesStore, RuntimeIdentity } from '../ports';
import { FilePreferencesStore } from './preferences-store';

// Keep the legacy reader for historical files; the desktop always operates in Qa.
export class QaPreferencesStore implements PreferencesStore {
  private readonly store: FilePreferencesStore;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly file: string,
    private readonly identity: RuntimeIdentity,
  ) {
    this.store = new FilePreferencesStore(file);
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => undefined);
    return result;
  }
  read(): Promise<Preferences> {
    return this.serialize(async () => {
      const current = await this.store.read();
      if (current.environment === 'QA') return current;
      await copyFile(
        this.file,
        `${this.file}.${this.identity.uuid()}.backup.json`,
        constants.COPYFILE_EXCL,
      );
      const next: Preferences = {
        ...current,
        environment: 'QA',
        audit: [
          ...current.audit,
          {
            id: this.identity.uuid(),
            timestamp: this.identity.now(),
            environment: 'QA' as const,
            previousEnvironment: current.environment,
            user: this.identity.user,
            machine: this.identity.hostname,
          },
        ].slice(-100),
      };
      await this.store.write(next);
      return next;
    });
  }
  write(preferences: Preferences): Promise<void> {
    return this.serialize(async () => {
      if (preferences.environment !== 'QA') throw Error('VALIDATION_ERROR');
      await this.store.write(preferences);
    });
  }
}
