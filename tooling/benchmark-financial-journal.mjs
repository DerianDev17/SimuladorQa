import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';

const directory = await mkdtemp(join(tmpdir(), 'financial-journal-benchmark-'));
const absolute = resolve(directory);
if (
  dirname(absolute) !== resolve(tmpdir()) ||
  !basename(absolute).startsWith('financial-journal-benchmark-')
)
  throw Error('BENCHMARK_PATH_INVALID');
const require = createRequire(import.meta.url);
const results = [];
try {
  await build({
    entryPoints: {
      store: 'apps/desktop/src/main/infrastructure/sqlite-balance-journal.ts',
      fixture: 'tests/helpers/withdrawal.ts',
    },
    outdir: directory,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
  });
  const { SqliteBalanceJournal } = require(join(directory, 'store.cjs'));
  const { approvedWithdrawalExecution } = require(join(directory, 'fixture.cjs'));
  for (const count of [1000, 10000]) {
    const store = new SqliteBalanceJournal(
      join(directory, `${count}.sqlite`),
      join(directory, `${count}.json`),
    );
    try {
      const items = Array.from({ length: count }, () => {
        const item = approvedWithdrawalExecution();
        delete item.withdrawal;
        return item;
      });
      await store.write(items);
      const measurements = { snapshotSaveMs: [], recordSaveMs: [] };
      for (let sample = 0; sample < 12; sample++) {
        const record = { ...items[0], elapsedMs: 500 + sample };
        let started = performance.now();
        const current = await store.read();
        await store.write([
          ...current.filter((item) => item.requestId !== record.requestId),
          record,
        ]);
        if (sample > 1) measurements.snapshotSaveMs.push(performance.now() - started);
        started = performance.now();
        await store.save({ ...record, elapsedMs: 1000 + sample });
        if (sample > 1) measurements.recordSaveMs.push(performance.now() - started);
      }
      const summary = (values) => {
        const sorted = values.toSorted((a, b) => a - b);
        return { p50: Number(sorted[4].toFixed(2)), p95: Number(sorted[9].toFixed(2)) };
      };
      results.push({
        records: count,
        samples: 10,
        snapshotSaveMs: summary(measurements.snapshotSaveMs),
        recordSaveMs: summary(measurements.recordSaveMs),
      });
    } finally {
      await store.close();
    }
  }
  console.log(
    JSON.stringify(
      {
        synthetic: true,
        node: process.version,
        scope: 'Save only; preflight validation, hardware and host excluded',
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await rm(absolute, { recursive: true, force: true });
}
