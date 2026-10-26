import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { FileBalanceJournal } from '../../apps/desktop/src/main/infrastructure/balance-journal';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { balanceLease, balanceRequest, balanceTarget } from '../helpers/balance-inquiry';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-financial-journal-'));
});
afterEach(async () => {
  await removeTestDirectory(directory, 'coonecta-financial-journal-');
});

function balanceRecord(): BalanceExecution {
  const record = approvedWithdrawalExecution();
  delete record.withdrawal;
  return record;
}

describe('diario financiero SQLite', () => {
  it('migra 200 entradas sin borrarlas y permite la operación 201 con idempotencia tras reinicio', async () => {
    const legacyPath = join(directory, 'balance-executions.json');
    const databasePath = join(directory, 'balance-executions.sqlite');
    const legacy = Array.from({ length: 200 }, () => balanceRecord());
    await new FileBalanceJournal(legacyPath).write(legacy);
    const original = await readFile(legacyPath, 'utf8');
    const journal = new SqliteBalanceJournal(databasePath, legacyPath);
    expect(await journal.read()).toHaveLength(200);
    const target = balanceTarget();
    const request = balanceRequest(target);
    const transport = {
      exchange: vi.fn(async () => ({
        outcome: 'APPROVED' as const,
        transmissionAttempted: true,
        bytesQueued: 536,
        elapsedMs: 20,
        responseCode: '00',
        balances: [
          {
            accountCode: '10' as const,
            type: '02' as const,
            currency: '840' as const,
            amount: '123.45',
          },
        ],
      })),
    };
    const runtime = {
      agentId: randomUUID(),
      hostname: 'test',
      user: 'test',
      version: 'test',
      uuid: randomUUID,
      now: () => '2026-10-12T20:00:00.000Z',
    };
    const service = new BalanceInquiryService(journal, transport, runtime, {
      inspect: async () => ({ ready: true, blockers: [] }),
      acquire: async () => balanceLease(target),
    });
    const done = await service.execute(
      request,
      target,
      { connect: 100, response: 100 },
      async () => true,
    );
    expect(done).toMatchObject({ ok: true, value: { outcome: 'APPROVED' } });
    expect(await journal.read()).toHaveLength(201);
    const recent = await journal.recent(50);
    expect(recent).toHaveLength(50);
    expect(recent[0]?.requestId).toBe(request.requestId);
    expect(recent.some((item) => item.requestId === legacy[0]?.requestId)).toBe(false);
    expect(await service.history()).toMatchObject({ ok: true, value: recent });
    await expect(journal.recent(51)).rejects.toThrow('BALANCE_JOURNAL_LIMIT_INVALID');
    expect(
      await service.execute(request, target, { connect: 100, response: 100 }, async () => true),
    ).toEqual(done);
    expect(transport.exchange).toHaveBeenCalledOnce();
    await journal.close();
    const reopened = new SqliteBalanceJournal(databasePath, legacyPath);
    expect(await reopened.read()).toHaveLength(201);
    expect((await reopened.read()).find((item) => item.requestId === request.requestId)).toEqual(
      done.ok ? done.value : null,
    );
    await expect(reopened.write([balanceRecord()])).rejects.toThrow(
      'BALANCE_JOURNAL_HISTORY_REMOVAL',
    );
    expect(await readFile(legacyPath, 'utf8')).toBe(original);
    await reopened.close();
  });

  it('bloquea una migración corrupta sin alterar el archivo original', async () => {
    const legacyPath = join(directory, 'balance-executions.json');
    await writeFile(legacyPath, 'corrupt-private');
    const journal = new SqliteBalanceJournal(
      join(directory, 'balance-executions.sqlite'),
      legacyPath,
    );
    await expect(journal.read()).rejects.toThrow();
    expect(await readFile(legacyPath, 'utf8')).toBe('corrupt-private');
    await new FileBalanceJournal(legacyPath).write([balanceRecord()]);
    expect(await journal.read()).toHaveLength(1);
    await journal.close();
  });

  it('conserva un retiro pendiente y no acepta registros del otro canal', async () => {
    const journal = new SqliteBalanceJournal(
      join(directory, 'withdrawal-executions.sqlite'),
      join(directory, 'withdrawal-executions.json'),
      'WITHDRAWAL',
    );
    const pending = {
      ...approvedWithdrawalExecution(),
      outcome: 'PENDING' as const,
      finishedAt: null,
      responseCode: null,
      balances: [],
    };
    await journal.write([pending]);
    await expect(journal.write([balanceRecord()])).rejects.toThrow('BALANCE_JOURNAL_INVALID');
    await journal.close();
    const reopened = new SqliteBalanceJournal(
      join(directory, 'withdrawal-executions.sqlite'),
      join(directory, 'withdrawal-executions.json'),
      'WITHDRAWAL',
    );
    expect(await reopened.read()).toEqual([pending]);
    await reopened.close();
  });
});
