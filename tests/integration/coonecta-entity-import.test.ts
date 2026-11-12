import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import { removeTestDirectory } from '../helpers/temporary-directory';

it('importador: vista previa sin escritura, respaldo, actualización por UUID y repetición sin duplicados', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coonecta-import-test-'));
  const file = join(directory, 'catalog.sqlite'),
    source = join(directory, 'source.txt');
  const store = new SqliteCatalog(file);
  const context = { user: 'test', machine: 'test', timestamp: '2026-11-12T12:00:00.000Z' };
  const created = store.execute(
    {
      kind: 'saveEntity',
      request: {
        environment: 'QA',
        id: null,
        revision: null,
        values: { code: '205', name: 'Previous', networkType: 'COONECTA', active: false },
      },
    },
    context,
  );
  if (!created.ok) throw Error(created.error.code);
  const originalId = created.value.entities[0]!.id;
  store.close();
  const old = new DatabaseSync(file);
  old.exec('ALTER TABLE entities DROP COLUMN member_types_json; PRAGMA user_version = 3');
  old.close();
  try {
    await writeFile(
      source,
      [
        'Synthetic CB EMI\t8205\t99999\t127.0.0.1\t12345\tFRONTEND AUT',
        'Synthetic Dual ADQ\t8200\t99998\t127.0.0.1\t12346\tSWITCH EXTERNO',
        'Synthetic Dual EMI\t8200\t99997\t127.0.0.1\t12347\tFRONTEND AUT',
        'CACECH EMI\t\t\t127.0.0.1\t12348\tSWITCH EXTERNO',
      ].join('\n'),
    );
    const run = async (name: string, apply: boolean) => {
      const report = join(directory, name + '.json');
      await promisify(execFile)(
        process.execPath,
        [
          resolve('tooling/import-coonecta-entities.mjs'),
          '--source',
          source,
          '--catalog',
          file,
          '--report',
          report,
          '--institution-prefix',
          '8',
          '--cacech-code',
          '312',
          ...(apply ? ['--apply'] : []),
        ],
        { timeout: 20000 },
      );
      return JSON.parse(await readFile(report, 'utf8'));
    };
    const before = await readFile(file);
    const preview = await run('preview', false);
    expect(preview).toMatchObject({
      applied: false,
      outcome: 'PREVIEW',
      sourceRows: 4,
      entityCount: 3,
      plannedCreates: 2,
      requiresValidation: ['200'],
    });
    expect(await readFile(file)).toEqual(before);
    const applied = await run('applied', true);
    expect(applied).toMatchObject({
      applied: true,
      outcome: 'COMPLETED',
      created: ['200', '312'],
      updated: ['205'],
    });
    const backup = new DatabaseSync(applied.backupPath, { readOnly: true });
    expect(backup.prepare('PRAGMA user_version').get()?.user_version).toBe(3);
    expect(backup.prepare('SELECT name FROM entities').get()?.name).toBe('Previous');
    backup.close();
    const check = new DatabaseSync(file, { readOnly: true });
    const saved = check
      .prepare('SELECT id,name,active,member_types_json FROM entities WHERE code = ?')
      .get('205');
    expect(saved).toMatchObject({
      id: originalId,
      name: 'Synthetic CB',
      active: 0,
      member_types_json: '["FRONT"]',
    });
    const auditBefore = check.prepare('SELECT count(*) AS count FROM catalog_audit').get()?.count;
    check.close();
    const repeated = await run('repeated', true);
    expect(repeated).toMatchObject({
      applied: true,
      created: [],
      updated: [],
      unchanged: ['200', '205', '312'],
    });
    const final = new DatabaseSync(file, { readOnly: true });
    expect(final.prepare('SELECT count(*) AS count FROM catalog_audit').get()?.count).toBe(
      auditBefore,
    );
    expect(final.prepare('SELECT count(*) AS count FROM entities').get()?.count).toBe(3);
    final.close();
    expect(JSON.stringify(applied)).not.toContain('127.0.0.1');
  } finally {
    await removeTestDirectory(directory, 'coonecta-import-test-');
  }
}, 30000);
