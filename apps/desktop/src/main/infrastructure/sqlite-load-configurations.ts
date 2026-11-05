import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  LOAD_CONFIGURATION_LIMIT,
  parseSaveLoadConfiguration,
  parseDeleteLoadConfiguration,
  validSavedLoadConfiguration,
} from '../../../../../packages/domain/src/load-configurations';
import type {
  SavedLoadConfiguration,
  SaveLoadConfiguration,
  DeleteLoadConfiguration,
} from '../../../../../packages/domain/src/load-configurations';
import { LoadConfigurationConflict } from '../load-configuration-ports';
import type { LoadConfigurationStore } from '../load-configuration-ports';
import type { RuntimeIdentity } from '../ports';
export class SqliteLoadConfigurations implements LoadConfigurationStore {
  private database: DatabaseSync | undefined;
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly path: string,
    private readonly identity: RuntimeIdentity,
  ) {}
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.tail.then(action);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async open(): Promise<DatabaseSync> {
    if (this.database) return this.database;
    await mkdir(dirname(this.path), { recursive: true });
    const db = new DatabaseSync(this.path, {
      timeout: 500,
      enableDoubleQuotedStringLiterals: false,
    });
    try {
      db.exec('PRAGMA synchronous = FULL');
      const version = db.prepare('PRAGMA user_version').get()?.user_version;
      if (version === 0) {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.exec(`CREATE TABLE configurations (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
            CREATE TABLE audit (id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, configuration_id TEXT NOT NULL, revision INTEGER NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL, machine TEXT NOT NULL);
            PRAGMA user_version = 1;`);
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      } else if (version !== 1) throw Error('CONFIG_SCHEMA');
      this.database = db;
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  }
  private rows(db: DatabaseSync): SavedLoadConfiguration[] {
    const rows = db.prepare('SELECT id, revision, payload FROM configurations ORDER BY id').all();
    if (rows.length > LOAD_CONFIGURATION_LIMIT) throw Error('CONFIG_LIMIT');
    return rows
      .map((row) => {
        const value: unknown = JSON.parse(String(row.payload));
        if (
          !validSavedLoadConfiguration(value) ||
          value.id !== row.id ||
          value.revision !== row.revision
        )
          throw Error('CONFIG_CORRUPT');
        return value;
      })
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }
  list(): Promise<SavedLoadConfiguration[]> {
    return this.serial(async () => this.rows(await this.open()));
  }
  save(input: SaveLoadConfiguration): Promise<SavedLoadConfiguration[]> {
    const request = parseSaveLoadConfiguration(input);
    if (!request) return Promise.reject(Error('CONFIG_INVALID'));
    return this.serial(async () => {
      const db = await this.open();
      db.exec('BEGIN IMMEDIATE');
      try {
        const rows = this.rows(db);
        const previous = request.id ? rows.find((row) => row.id === request.id) : undefined;
        if (
          (request.id && (!previous || previous.revision !== request.revision)) ||
          (!request.id && rows.length >= LOAD_CONFIGURATION_LIMIT)
        )
          throw new LoadConfigurationConflict();
        const now = this.identity.now();
        const saved: SavedLoadConfiguration = {
          id: previous?.id ?? this.identity.uuid(),
          revision: (previous?.revision ?? 0) + 1,
          name: request.name,
          draft: request.draft,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        };
        if (!validSavedLoadConfiguration(saved)) throw Error('CONFIG_INVALID');
        db.prepare(
          'INSERT INTO configurations (id, revision, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, payload = excluded.payload',
        ).run(saved.id, saved.revision, JSON.stringify(saved));
        this.audit(db, saved, previous ? 'UPDATED' : 'CREATED');
        const result = this.rows(db);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
  }
  delete(input: DeleteLoadConfiguration): Promise<SavedLoadConfiguration[]> {
    const request = parseDeleteLoadConfiguration(input);
    if (!request) return Promise.reject(Error('CONFIG_INVALID'));
    return this.serial(async () => {
      const db = await this.open();
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = this.rows(db).find((row) => row.id === request.id);
        if (!current || current.revision !== request.revision)
          throw new LoadConfigurationConflict();
        db.prepare('DELETE FROM configurations WHERE id = ?').run(current.id);
        this.audit(db, current, 'DELETED');
        const result = this.rows(db);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    });
  }
  private audit(db: DatabaseSync, saved: SavedLoadConfiguration, action: string): void {
    db.prepare('INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      this.identity.uuid(),
      this.identity.now(),
      saved.id,
      saved.revision,
      action,
      this.identity.user,
      this.identity.hostname,
    );
  }
  close(): Promise<void> {
    return this.serial(async () => {
      this.database?.close();
      this.database = undefined;
    });
  }
}
