import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';

const directory = await mkdtemp(join(tmpdir(), 'load-history-benchmark-'));
const absolute = resolve(directory);
if (
  dirname(absolute) !== resolve(tmpdir()) ||
  !absolute.split(sep).at(-1).startsWith('load-history-benchmark-')
)
  throw Error('BENCHMARK_PATH_INVALID');
const require = createRequire(import.meta.url);
const results = [];
try {
  await build({
    entryPoints: {
      store: 'apps/desktop/src/main/infrastructure/sqlite-load-run-store.ts',
      client: 'apps/desktop/src/main/infrastructure/worker-load-run-store.ts',
      worker: 'apps/desktop/src/main/infrastructure/load-store-worker.ts',
    },
    outdir: directory,
    outExtension: { '.js': '.cjs' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
  });
  const { SqliteLoadRunStore } = require(join(directory, 'store.cjs'));
  // Same projection/validation; disable only the index hint for the index-free baseline.
  const baselineSource = (
    await readFile('apps/desktop/src/main/infrastructure/sqlite-load-run-store.ts', 'utf8')
  ).replace("'INDEXED BY runs_started'", "''");
  await build({
    stdin: {
      contents: baselineSource,
      resolveDir: resolve('apps/desktop/src/main/infrastructure'),
      loader: 'ts',
    },
    outfile: join(directory, 'baseline.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
  });
  const { SqliteLoadRunStore: BaselineStore } = require(join(directory, 'baseline.cjs'));
  const { WorkerLoadRunStore } = require(join(directory, 'client.cjs'));
  for (const count of [1000, 10000, 50000]) {
    const file = join(directory, `${count}.sqlite`);
    const legacy = join(directory, `${count}.json`);
    const store = new SqliteLoadRunStore(file, legacy);
    await store.read();
    await store.close();
    const database = new DatabaseSync(file);
    const atmId = randomUUID();
    database.exec(
      'DROP INDEX runs_state; DROP INDEX runs_operation; DROP INDEX runs_started; DROP INDEX runs_invalid_json; BEGIN',
    );
    const insert = database.prepare('INSERT INTO runs(run_id,request_id,payload) VALUES (?,?,?)');
    for (let index = 0; index < count; index++) {
      const run = {
        runId: randomUUID(),
        requestId: randomUUID(),
        draft: {
          environment: 'QA',
          operation: 'BALANCE',
          mode: 'LOAD',
          atmId,
          atmRevision: 1,
          targetTps: 1,
          concurrency: 1,
          maxTransactions: 1,
          durationSeconds: 60,
          rampUpSeconds: 0,
        },
        startedAt: '2026-11-07T10:00:00.000Z',
        finishedAt: '2026-11-07T10:00:01.000Z',
        state: 'COMPLETED',
        message: 'Synthetic benchmark',
        active: 0,
        elapsedMs: 1000,
        items: [],
      };
      insert.run(run.runId, run.requestId, JSON.stringify(run));
    }
    database.exec('COMMIT');
    database.close();
    const queries = {
      state: { state: 'FAILED' },
      operation: { operation: 'WITHDRAWAL' },
      date: { from: '2026-11-08T00:00:00.000Z' },
      atm: { atmId: randomUUID() },
      page: {},
    };
    async function measure(adapter, label) {
      await adapter.read(); // Warm startup/migration separately from steady-state queries.
      for (const [query, filters] of Object.entries(queries)) {
        const times = [];
        const delays = [];
        for (let sample = 0; sample < 15; sample++) {
          const start = performance.now();
          const heartbeat = new Promise((done) =>
            setTimeout(() => done(performance.now() - start), 0),
          );
          await adapter.list(filters);
          times.push(performance.now() - start);
          delays.push(await heartbeat);
        }
        times.sort((a, b) => a - b);
        delays.sort((a, b) => a - b);
        results.push({
          count,
          adapter: label,
          query,
          p50Ms: +times[7].toFixed(2),
          p95Ms: +times[14].toFixed(2),
          eventLoopP95Ms: +delays[14].toFixed(2),
          rssMiB: +(process.memoryUsage().rss / 1048576).toFixed(1),
        });
      }
      await adapter.close();
    }
    await measure(new BaselineStore(file, legacy), 'main-unindexed');
    const old = new DatabaseSync(file);
    old.exec('PRAGMA user_version = 1');
    old.close();
    await measure(new SqliteLoadRunStore(file, legacy), 'main-indexed');
    await measure(
      new WorkerLoadRunStore(join(directory, 'worker.cjs'), file, legacy),
      'worker-indexed',
    );
  }
  console.log(
    JSON.stringify({ samples: 15, rows: 'synthetic, empty items, warm reads', results }, null, 2),
  );
} finally {
  // Only the freshly created benchmark directory is eligible for recursive cleanup.
  await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
