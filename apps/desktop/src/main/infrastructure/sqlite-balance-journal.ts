import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { BalanceExecution } from '../../../../../packages/domain/src/balance-inquiry';
import type { BalanceJournal } from '../balance-ports';
import { FileBalanceJournal, parseBalanceJournal } from './balance-journal';

interface StoredRow {
  request_id: string;
  payload: string;
}

// The legacy JSON remains untouched as a migration backup. No financial record
// is evicted, and request_id stays unique across the lifetime of this database.
export class SqliteBalanceJournal implements BalanceJournal {
  private database: DatabaseSync | undefined;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly path: string,
    private readonly legacyPath: string,
    private readonly operation: 'BALANCE' | 'WITHDRAWAL' = 'BALANCE',
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private accepts(item: BalanceExecution): boolean {
    return this.operation === 'WITHDRAWAL' ? !!item.withdrawal : !item.withdrawal;
  }

  private parseItem(value: unknown): BalanceExecution {
    const parsed = parseBalanceJournal({ version: 1, executions: [value] });
    if (!parsed || !this.accepts(parsed[0]!)) throw Error('BALANCE_JOURNAL_INVALID');
    return parsed[0]!;
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
            CREATE TABLE executions (
              sequence INTEGER PRIMARY KEY AUTOINCREMENT,
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
      } else if (version !== 1) throw Error('BALANCE_JOURNAL_SCHEMA_UNSUPPORTED');

      const migration = database
        .prepare("SELECT value FROM metadata WHERE key = 'legacy_imported'")
        .get();
      if (migration && migration.value !== '1') throw Error('BALANCE_JOURNAL_INVALID');
      if (!migration) {
        const legacy = await new FileBalanceJournal(this.legacyPath, this.operation).read();
        database.exec('BEGIN IMMEDIATE');
        try {
          if (database.prepare('SELECT request_id FROM executions LIMIT 1').get())
            throw Error('BALANCE_JOURNAL_INVALID');
          const insert = database.prepare(
            'INSERT INTO executions (request_id, payload) VALUES (?, ?)',
          );
          for (const item of legacy) insert.run(item.requestId, JSON.stringify(item));
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

  async read(): Promise<BalanceExecution[]> {
    return this.serialize(async () => {
      const database = await this.open();
      const rows = database
        .prepare('SELECT request_id, payload FROM executions ORDER BY sequence')
        .all() as unknown as StoredRow[];
      return this.parseRows(rows);
    });
  }

  async recent(limit: number): Promise<BalanceExecution[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw Error('BALANCE_JOURNAL_LIMIT_INVALID');
    return this.serialize(async () => {
      const database = await this.open();
      const rows = database
        .prepare('SELECT request_id, payload FROM executions ORDER BY sequence DESC LIMIT ?')
        .all(limit) as unknown as StoredRow[];
      return this.parseRows(rows);
    });
  }

  private parseRows(rows: readonly StoredRow[]): BalanceExecution[] {
    return rows.map((row) => {
      if (typeof row.request_id !== 'string' || typeof row.payload !== 'string')
        throw Error('BALANCE_JOURNAL_INVALID');
      const item = this.parseItem(JSON.parse(row.payload) as unknown);
      if (item.requestId !== row.request_id) throw Error('BALANCE_JOURNAL_INVALID');
      return item;
    });
  }

  async write(executions: readonly BalanceExecution[]): Promise<void> {
    return this.serialize(async () => {
      const snapshot = executions.map((item) => this.parseItem(item));
      const requests = new Set(snapshot.map((item) => item.requestId));
      if (requests.size !== snapshot.length) throw Error('BALANCE_JOURNAL_INVALID');
      const database = await this.open();
      const existing = database
        .prepare('SELECT request_id, payload FROM executions')
        .all() as unknown as StoredRow[];
      if (existing.some((row) => !requests.has(row.request_id)))
        throw Error('BALANCE_JOURNAL_HISTORY_REMOVAL');
      const previous = new Map(existing.map((row) => [row.request_id, row.payload]));
      database.exec('BEGIN IMMEDIATE');
      try {
        const insert = database.prepare(
          'INSERT INTO executions (request_id, payload) VALUES (?, ?)',
        );
        const update = database.prepare('UPDATE executions SET payload = ? WHERE request_id = ?');
        for (const item of snapshot) {
          const payload = JSON.stringify(item);
          if (!previous.has(item.requestId)) insert.run(item.requestId, payload);
          else if (previous.get(item.requestId) !== payload) update.run(payload, item.requestId);
        }
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
