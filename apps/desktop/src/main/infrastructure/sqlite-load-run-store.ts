import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isUuid } from '../../../../../packages/domain/src/catalogs';
import type { LoadRunSnapshot } from '../../../../../packages/domain/src/load-run';
import {
  LOAD_HISTORY_PAGE_SIZE,
  parseLoadHistoryQuery,
} from '../../../../../packages/domain/src/load-history';
import type {
  LoadHistoryPage,
  LoadHistoryQuery,
} from '../../../../../packages/domain/src/load-history';
import { loadRunMetrics } from '../../../../../packages/domain/src/load-run';
import type { LoadHistoryStore } from '../load-history-ports';
import type { LoadRunStore } from '../load-ports';
import { readLegacyLoadRuns, validLoadRunSnapshot } from './load-run-store';

interface StoredRun {
  run_id: string;
  request_id: string;
  payload: string;
}

// Guard index expressions so a corrupt payload remains inspectable and is reported on read.
const stateExpression = "CASE WHEN json_valid(payload) THEN json_extract(payload, '$.state') END";
const operationExpression =
  "CASE WHEN json_valid(payload) THEN json_extract(payload, '$.draft.operation') END";
const startedExpression =
  "CASE WHEN json_valid(payload) THEN julianday(json_extract(payload, '$.startedAt')) END";

export class SqliteLoadRunStore implements LoadRunStore, LoadHistoryStore {
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
      } else if (version !== 1 && version !== 2) throw Error('LOAD_STORE_SCHEMA_UNSUPPORTED');

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
      if (version !== 2) {
        database.exec('BEGIN IMMEDIATE');
        try {
          database.exec(`
            CREATE INDEX runs_state ON runs((${stateExpression}), sequence DESC);
            CREATE INDEX runs_operation ON runs((${operationExpression}), sequence DESC);
            CREATE INDEX runs_started ON runs((${startedExpression}), sequence DESC);
            CREATE INDEX runs_invalid_json ON runs(sequence) WHERE NOT json_valid(payload);
            PRAGMA user_version = 2;
          `);
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
      return this.decode(row);
    });
  }

  private decode(row: StoredRun): LoadRunSnapshot {
    const value: unknown = JSON.parse(row.payload);
    if (
      !validLoadRunSnapshot(value) ||
      value.runId !== row.run_id ||
      value.requestId !== row.request_id
    )
      throw Error('LOAD_STORE_INVALID');
    return value;
  }

  async get(id: string): Promise<LoadRunSnapshot | null> {
    return this.serialize(async () => {
      if (!isUuid(id)) throw Error('LOAD_RUN_INVALID');
      const row = (await this.open())
        .prepare('SELECT run_id, request_id, payload FROM runs WHERE run_id = ?')
        .get(id) as unknown as StoredRun | undefined;
      return row ? this.decode(row) : null;
    });
  }

  async list(input: LoadHistoryQuery): Promise<LoadHistoryPage> {
    // Snapshot the caller's filters before entering the serialized queue.
    const query = parseLoadHistoryQuery(input);
    if (!query) throw Error('LOAD_HISTORY_INVALID');
    return this.serialize(async () => {
      const clauses: string[] = [];
      const values: (string | number)[] = [];
      if (query.before !== undefined) {
        clauses.push('sequence < ?');
        values.push(query.before);
      }
      if (query.from) {
        clauses.push(`(${startedExpression}) >= julianday(?)`);
        values.push(query.from);
      }
      if (query.to) {
        clauses.push(`(${startedExpression}) < julianday(?)`);
        values.push(query.to);
      }
      if (query.operation) {
        clauses.push(`(${operationExpression}) = ?`);
        values.push(query.operation);
      }
      if (query.state) {
        clauses.push(`(${stateExpression}) = ?`);
        values.push(query.state);
      }
      if (query.atmId) {
        clauses.push(
          "(json_extract(payload, '$.draft.atmId') = ? OR EXISTS (SELECT 1 FROM json_each(payload, '$.draft.additionalAtms') WHERE json_extract(value, '$.atmId') = ?))",
        );
        values.push(query.atmId, query.atmId);
      }
      const database = await this.open();
      if (database.prepare('SELECT 1 FROM runs WHERE NOT json_valid(payload) LIMIT 1').get())
        throw Error('LOAD_STORE_INVALID');
      const rows = database
        .prepare(
          `SELECT sequence, run_id, request_id, payload FROM runs ${
            (query.from || query.to) && !query.state && !query.operation
              ? 'INDEXED BY runs_started'
              : ''
          } ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY sequence DESC LIMIT ?`,
        )
        .all(...values, LOAD_HISTORY_PAGE_SIZE + 1) as unknown as (StoredRun & {
        sequence: number;
      })[];
      const page = rows.slice(0, LOAD_HISTORY_PAGE_SIZE);
      return {
        entries: page.map((row) => {
          const run = this.decode(row);
          return {
            runId: run.runId,
            startedAt: run.startedAt,
            finishedAt: run.finishedAt,
            state: run.state,
            draft: run.draft,
            metrics: loadRunMetrics(run),
          };
        }),
        next: rows.length > LOAD_HISTORY_PAGE_SIZE ? page.at(-1)!.sequence : null,
      };
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
