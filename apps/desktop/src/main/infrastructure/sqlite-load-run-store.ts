import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isUuid } from '../../../../../packages/domain/src/catalogs';
import type { LoadRunSnapshot } from '../../../../../packages/domain/src/load-run';
import type { LoadRunStore } from '../load-run-service';
import { readLegacyLoadRuns, validLoadRunSnapshot } from './load-run-store';

interface StoredRun {
  run_id: string;
  request_id: string;
  payload: string;
}

export class SqliteLoadRunStore implements LoadRunStore {
  private database: DatabaseSync | undefined;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly legacyPath: string,
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async open(): Promise<DatabaseSync> {
    if (this.database) return this.database;
    await mkdir(dirname(this.path), { recursive: true });
    const database = new DatabaseSync(this.path, {
      timeout: 500,
      enableDoubleQuotedStringLiterals: false,
    });
    try {
      database.exec('PRAGMA synchronous = FULL');
      const version = database.prepare('PRAGMA user_version').get()?.user_version;
      if (version === 0) {
        database.exec('BEGIN IMMEDIATE');
        try {
          database.exec(`
            CREATE TABLE runs (
              sequence INTEGER PRIMARY KEY AUTOINCREMENT,
              run_id TEXT NOT NULL UNIQUE,
              request_id TEXT NOT NULL UNIQUE,
              payload TEXT NOT NULL
            );
            CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            PRAGMA user_version = 1;
          `);
          database.exec('COMMIT');
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      } else if (version !== 1) throw Error('LOAD_STORE_SCHEMA_UNSUPPORTED');

      const migration = database
        .prepare("SELECT value FROM metadata WHERE key = 'legacy_imported'")
        .get();
      if (migration && migration.value !== '1') throw Error('LOAD_STORE_INVALID');
      if (!migration) {
        const legacy = await readLegacyLoadRuns(this.legacyPath);
        database.exec('BEGIN IMMEDIATE');
        try {
          if (database.prepare('SELECT run_id FROM runs LIMIT 1').get())
            throw Error('LOAD_STORE_INVALID');
          const insert = database.prepare(
            'INSERT INTO runs (run_id, request_id, payload) VALUES (?, ?, ?)',
          );
          for (const run of legacy) insert.run(run.runId, run.requestId, JSON.stringify(run));
          database
            .prepare("INSERT INTO metadata (key, value) VALUES ('legacy_imported', '1')")
            .run();
          database.exec('COMMIT');
        } catch (error) {
          database.exec('ROLLBACK');
          throw error;
        }
      }
      this.database = database;
      return database;
    } catch (error) {
      database.close();
      throw error;
    }
  }

  async read(): Promise<LoadRunSnapshot | null> {
    return this.serialize(async () => {
      const database = await this.open();
      const row = database
        .prepare('SELECT run_id, request_id, payload FROM runs ORDER BY sequence DESC LIMIT 1')
        .get() as unknown as StoredRun | undefined;
      if (!row) return null;
      let value: unknown;
      try {
        value = JSON.parse(row.payload);
      } catch {
        throw Error('LOAD_STORE_INVALID');
      }
      if (
        !validLoadRunSnapshot(value) ||
        value.runId !== row.run_id ||
        value.requestId !== row.request_id
      )
        throw Error('LOAD_STORE_INVALID');
      return value;
    });
  }

  async hasRequest(id: string): Promise<boolean> {
    return this.serialize(async () => {
      if (!isUuid(id)) throw Error('LOAD_RUN_INVALID');
      return !!(await this.open())
        .prepare('SELECT 1 FROM runs WHERE request_id = ? LIMIT 1')
        .get(id);
    });
  }

  async write(run: LoadRunSnapshot): Promise<void> {
    return this.serialize(async () => {
      if (!validLoadRunSnapshot(run)) throw Error('LOAD_RUN_INVALID');
      const database = await this.open();
      database.exec('BEGIN IMMEDIATE');
      try {
        const previous = database
          .prepare('SELECT request_id FROM runs WHERE run_id = ?')
          .get(run.runId);
        if (previous && previous.request_id !== run.requestId) throw Error('LOAD_RUN_INVALID');
        const owner = database
          .prepare('SELECT run_id FROM runs WHERE request_id = ?')
          .get(run.requestId);
        if (owner && owner.run_id !== run.runId) throw Error('LOAD_RUN_DUPLICATE_REQUEST');
        const payload = JSON.stringify(run);
        if (previous)
          database.prepare('UPDATE runs SET payload = ? WHERE run_id = ?').run(payload, run.runId);
        else
          database
            .prepare('INSERT INTO runs (run_id, request_id, payload) VALUES (?, ?, ?)')
            .run(run.runId, run.requestId, payload);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    });
  }

  async close(): Promise<void> {
    return this.serialize(async () => {
      this.database?.close();
      this.database = undefined;
    });
  }
}
