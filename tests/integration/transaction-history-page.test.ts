import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import { TransactionHistoryService } from '../../apps/desktop/src/main/transaction-history-service';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { removeTestDirectory } from '../helpers/temporary-directory';
import type { TransactionHistoryQuery } from '../../packages/domain/src/transaction-history';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';

let directory: string;
let journals: Record<'BALANCE' | 'WITHDRAWAL' | 'DEPOSIT', SqliteBalanceJournal>;
const preferences = {
  read: async () => ({ version: 1 as const, environment: 'QA' as const, audit: [] }),
};
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'transaction-pages-'));
  journals = Object.fromEntries(
    (['BALANCE', 'WITHDRAWAL', 'DEPOSIT'] as const).map((operation) => [
      operation,
      new SqliteBalanceJournal(
        join(directory, `${operation}.sqlite`),
        join(directory, `${operation}.json`),
        operation,
      ),
    ]),
  ) as typeof journals;
});
afterEach(async () => {
  await Promise.all(Object.values(journals).map((journal) => journal.close()));
  await removeTestDirectory(directory, 'transaction-pages-');
});
describe('historial completo en SQLite', () => {
  it('pagina tres diarios con fechas iguales sin omitir ni duplicar y busca registros fuera de los últimos 50', async () => {
    const records: BalanceExecution[] = [];
    for (const operation of ['BALANCE', 'WITHDRAWAL', 'DEPOSIT'] as const) {
      const batch = Array.from({ length: 65 }, (_, index) => {
        const item = approvedWithdrawalExecution();
        if (operation !== 'WITHDRAWAL') delete item.withdrawal;
        if (operation === 'DEPOSIT')
          item.deposit = {
            transaction: 'DEPOSIT',
            account: 'SAVINGS',
            currency: '840',
            amount: '10.00',
          };
        item.correlation!.stan = String(index).padStart(6, '0');
        records.push(item);
        return item;
      });
      await journals[operation].write(batch);
    }
    const service = new TransactionHistoryService(journals, preferences);
    let query: TransactionHistoryQuery = { environment: 'QA' };
    const seen: string[] = [];
    for (;;) {
      const result = await service.list(query);
      expect(result.ok).toBe(true);
      if (!result.ok) throw Error('PAGE_FAILED');
      expect(result.value.entries.length).toBeLessThanOrEqual(50);
      seen.push(...result.value.entries.map((item) => item.requestId));
      if (!result.value.next) break;
      query = { ...query, before: result.value.next };
    }
    expect(seen).toHaveLength(195);
    expect(new Set(seen).size).toBe(195);
    const old = records[0]!;
    expect(
      (await journals.BALANCE.recent(50)).some((item) => item.requestId === old.requestId),
    ).toBe(false);
    expect(
      await service.list({
        environment: 'QA',
        reference: old.requestId,
        from: old.startedAt,
        to: '2026-10-20T00:00:00.000Z',
      }),
    ).toMatchObject({ ok: true, value: { entries: [old], next: null } });
    expect(
      await service.list({ environment: 'QA', operation: 'DEPOSIT', reference: '000000' }),
    ).toMatchObject({ ok: true, value: { entries: [records[130]], next: null } });
    expect(await service.list({ environment: 'QA', to: old.startedAt })).toMatchObject({
      ok: true,
      value: { entries: [], next: null },
    });
  });
  it('migra v1, mantiene secuencia al actualizar y conserva otros registros al reabrir', async () => {
    const file = join(directory, 'BALANCE.sqlite');
    const db = new DatabaseSync(file);
    const item = approvedWithdrawalExecution();
    delete item.withdrawal;
    db.exec(
      "CREATE TABLE executions(sequence INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL); CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO metadata VALUES('legacy_imported','1'); PRAGMA user_version=1;",
    );
    db.prepare('INSERT INTO executions(request_id,payload) VALUES(?,?)').run(
      item.requestId,
      JSON.stringify(item),
    );
    db.close();
    const other = { ...item, requestId: approvedWithdrawalExecution().requestId };
    await journals.BALANCE.save(other);
    await journals.BALANCE.save({ ...item, elapsedMs: 500 });
    expect((await journals.BALANCE.recent(2)).map((record) => record.requestId)).toEqual([
      other.requestId,
      item.requestId,
    ]);
    await journals.BALANCE.close();
    expect(await journals.BALANCE.find(item.requestId)).toMatchObject({ elapsedMs: 500 });
    expect(await journals.BALANCE.read()).toHaveLength(2);
    await expect(journals.BALANCE.save(approvedWithdrawalExecution())).rejects.toThrow(
      'BALANCE_JOURNAL_INVALID',
    );
    await expect(journals.BALANCE.find('../invalid')).rejects.toThrow();
  });
  it('no devuelve páginas parciales ante corrupción, rechaza filtros y ambientes ajenos', async () => {
    await writeFile(join(directory, 'DEPOSIT.sqlite'), 'private-corrupt-data');
    const service = new TransactionHistoryService(journals, preferences);
    const result = await service.list({ environment: 'QA' });
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-corrupt-data');
    expect(await service.list({ environment: 'QA', limit: 5000 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    const wrongEnvironment = new TransactionHistoryService(journals, {
      read: async () => ({ version: 1, environment: 'PREPROD', audit: [] }),
    });
    expect(await wrongEnvironment.list({ environment: 'QA' })).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });
  });
});
