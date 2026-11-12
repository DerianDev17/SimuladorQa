import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir, hostname, userInfo } from 'node:os';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { DatabaseSync, backup } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

const { values: args } = parseArgs({
  options: {
    source: { type: 'string' },
    catalog: { type: 'string' },
    report: { type: 'string' },
    'institution-prefix': { type: 'string' },
    'cacech-code': { type: 'string' },
    apply: { type: 'boolean', default: false },
  },
});
if (
  !args.source ||
  !args.catalog ||
  !args.report ||
  args['institution-prefix'] !== '8' ||
  !/^\d{3}$/.test(args['cacech-code'] ?? '')
) {
  throw Error(
    'Usa --source, --catalog, --report, --institution-prefix 8 y --cacech-code con el código confirmado; --apply aplica el catálogo.',
  );
}
const directory = await mkdtemp(join(tmpdir(), 'coonecta-entity-import-'));
if (
  dirname(resolve(directory)) !== resolve(tmpdir()) ||
  !directory.split(/[\\/]/).at(-1)?.startsWith('coonecta-entity-import-')
)
  throw Error('INVALID_TEMP_DIRECTORY');
const sourcePath = resolve(args.source),
  catalogPath = resolve(args.catalog),
  reportPath = resolve(args.report);
let catalog;
let report;
let ownsReport = false;
try {
  const bundle = join(directory, 'import.cjs');
  await build({
    stdin: {
      contents:
        "export {SqliteCatalog} from './apps/desktop/src/main/infrastructure/sqlite-catalog'; export {parseCoonectaEntityList} from './apps/desktop/src/main/adapters/coonecta-entity-list';",
      resolveDir: resolve('.'),
    },
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
  });
  const { SqliteCatalog, parseCoonectaEntityList } = createRequire(import.meta.url)(bundle);
  const source = await readFile(sourcePath, 'utf8');
  const entries = parseCoonectaEntityList(source, {
    institutionPrefix: args['institution-prefix'],
    missingCodes: { CACECH: args['cacech-code'] },
  });
  const readonly = new DatabaseSync(catalogPath, { readOnly: true });
  let before, atms;
  const backupPath = join(dirname(catalogPath), `catalogs.before-entities-${randomUUID()}.sqlite`);
  try {
    before = readonly
      .prepare('SELECT id,code,name,network_type,active,revision FROM entities')
      .all();
    atms = readonly.prepare('SELECT * FROM atm_profiles ORDER BY id').all();
    if (args.apply) await backup(readonly, backupPath);
  } finally {
    readonly.close();
  }
  report = {
    applied: false,
    outcome: args.apply ? 'IN_PROGRESS' : 'PREVIEW',
    timestamp: new Date().toISOString(),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    mapping: { institutionPrefixRemoved: '8', CACECH: args['cacech-code'] },
    sourceRows: entries.reduce((sum, item) => sum + item.sourceRows.length, 0),
    entityCount: entries.length,
    plannedCreates: entries.filter(
      (entry) => !before.some((entity) => entity.code === entry.values.code),
    ).length,
    requiresValidation: entries
      .filter((entry) => entry.requiresValidation)
      .map((entry) => entry.values.code),
    ...(args.apply ? { backupPath } : {}),
    entries,
    created: [],
    updated: [],
    unchanged: [],
  };
  // Write a reviewable, sanitized source report before any migration/mutation.
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  ownsReport = true;
  if (args.apply) {
    catalog = new SqliteCatalog(catalogPath);
    const context = {
      user: userInfo().username,
      machine: hostname(),
      timestamp: new Date().toISOString(),
    };
    const snapshot = catalog.execute({ kind: 'list', environment: 'QA' }, context);
    if (!snapshot.ok) throw Error(snapshot.error.code);
    const existing = new Map(snapshot.value.entities.map((entity) => [entity.code, entity]));
    for (const entry of entries) {
      const previous = existing.get(entry.values.code);
      const values = { ...entry.values, active: previous?.active ?? true };
      if (
        previous &&
        previous.name === values.name &&
        previous.networkType === values.networkType &&
        JSON.stringify(previous.memberTypes ?? []) === JSON.stringify(values.memberTypes)
      ) {
        report.unchanged.push(values.code);
        continue;
      }
      const saved = catalog.execute(
        {
          kind: 'saveEntity',
          request: {
            environment: 'QA',
            id: previous?.id ?? null,
            revision: previous?.revision ?? null,
            values,
          },
        },
        { ...context, timestamp: new Date().toISOString() },
      );
      if (!saved.ok) throw Error(`ENTITY_IMPORT_${saved.error.code}_${values.code}`);
      (previous ? report.updated : report.created).push(values.code);
    }
    const result = catalog.execute({ kind: 'list', environment: 'QA' }, context);
    if (!result.ok) throw Error(result.error.code);
    for (const entry of entries) {
      const saved = result.value.entities.find((entity) => entity.code === entry.values.code);
      if (
        !saved ||
        saved.name !== entry.values.name ||
        JSON.stringify(saved.memberTypes) !== JSON.stringify(entry.values.memberTypes)
      )
        throw Error('ENTITY_IMPORT_VERIFY_FAILED');
    }
    const check = new DatabaseSync(catalogPath, { readOnly: true });
    try {
      if (
        JSON.stringify(check.prepare('SELECT * FROM atm_profiles ORDER BY id').all()) !==
        JSON.stringify(atms)
      )
        throw Error('ATM_IDENTITY_CHANGED');
      for (const previous of before) {
        if (
          result.value.entities.find((entity) => entity.code === previous.code)?.id !== previous.id
        )
          throw Error('ENTITY_IDENTITY_CHANGED');
      }
    } finally {
      check.close();
    }
    report.applied = true;
    report.outcome = 'COMPLETED';
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(
    JSON.stringify({
      applied: report.applied,
      sourceRows: report.sourceRows,
      entities: report.entityCount,
      plannedCreates: report.plannedCreates,
      created: report.created.length,
      updated: report.updated.length,
      unchanged: report.unchanged.length,
      requiresValidation: report.requiresValidation,
      reportPath,
      ...(args.apply ? { backupPath } : {}),
    }),
  );
} catch (error) {
  if (report && ownsReport) {
    report.outcome = 'FAILED';
    report.applied = false;
    report.error =
      error instanceof Error && /^[A-Z_0-9]+$/.test(error.message)
        ? error.message
        : 'IMPORT_FAILED';
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  }
  throw error;
} finally {
  catalog?.close();
  // Only the temporary directory created by mkdtemp above; no user data is removed.
  // The constant absolute path was verified against the temporary root above.
  await rm(directory, { recursive: true, force: true });
}
