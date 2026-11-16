import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SqliteLoadRunStore } from '../../apps/desktop/src/main/infrastructure/sqlite-load-run-store';
import { SqliteCatalog } from '../../apps/desktop/src/main/infrastructure/sqlite-catalog';
import { historyRun } from '../helpers/load-history';
import { loadReportExample } from '../helpers/load-report-examples';
import { createLoadExport } from '../../packages/domain/src/load-export';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let app: ElectronApplication | undefined;
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'load-history-e2e-'));
});

test('informe HTML: ejemplos visuales, barras proporcionales y aviso de incertidumbre', async () => {
  await launch();
  await mkdir('artifacts', { recursive: true });
  for (const uncertain of [false, true]) {
    const run = loadReportExample(uncertain);
    const name = uncertain ? 'uncertain' : 'completed';
    const file = resolve(`artifacts/load-report-${name}.html`);
    const exported = createLoadExport(run, 'HTML', '2026-11-16T15:00:00.000Z');
    // Label preview files explicitly; the application export remains unmodified.
    await writeFile(
      file,
      exported.contents.replace(
        '<h2 id="results">',
        '<p class="eyebrow">EJEMPLO · DATOS SINTÉTICOS</p><h2 id="results">',
      ),
    );
    const opened = app!.waitForEvent('window');
    await app!.evaluate(async ({ BrowserWindow }, filePath) => {
      const reportWindow = new BrowserWindow({
        show: false,
        width: 1280,
        height: 1100,
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      await reportWindow.loadFile(filePath);
    }, file);
    const report = await opened;
    const results = report.getByRole('region', { name: 'Resultados de ejecución' });
    const throughput = report.getByRole('list', { name: 'TPS observado y objetivo' });
    const bars = throughput.locator('.bar-fill');
    const observed = await bars.nth(0).evaluate((element) => element.getBoundingClientRect().width);
    const target = await bars.nth(1).evaluate((element) => element.getBoundingClientRect().width);
    expect(observed / target).toBeCloseTo(uncertain ? 0.08 : 2 / 3, 2);
    await expect(report.getByLabel('Envíos sin respuesta', { exact: true })).toHaveCount(
      uncertain ? 1 : 0,
    );
    await expect(report.getByRole('list', { name: 'Percentiles de latencia' })).toContainText(
      uncertain ? '140.00 ms' : '245.00 ms',
    );
    await results.screenshot({ path: `artifacts/load-report-${name}.png` });
    await report.setViewportSize({ width: 390, height: 844 });
    expect(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await report.emulateMedia({ media: 'print' });
    await report.setViewportSize({ width: 1120, height: 790 });
    expect(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await report.close();
  }
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await removeTestDirectory(directory, 'load-history-e2e-');
});
async function launch() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
  app = await electron.launch({
    args: [resolve('dist/main.cjs'), `--user-data-dir=${directory}`, '--simulate-reader'],
    env,
  });
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
  await window.getByRole('button', { name: 'Carga y estrés', exact: true }).click();
  await window.getByRole('button', { name: 'Ver historial de carga', exact: true }).click();
  return window;
}

test('historial de carga: paginación, filtros, correlación, recarga y reinicio reales', async () => {
  test.setTimeout(60000);
  const store = new SqliteLoadRunStore(
    join(directory, 'qa-load-runs.sqlite'),
    join(directory, 'qa-load-runs.json'),
  );
  const withdrawal = historyRun();
  const context = { user: 'test', machine: 'test', timestamp: '2026-11-07T12:00:00.000Z' };
  const catalog = new SqliteCatalog(join(directory, 'catalogs.sqlite'));
  const entity = catalog.execute(
    {
      kind: 'saveEntity',
      request: {
        environment: 'QA',
        id: null,
        revision: null,
        values: { code: 'TEST', name: 'Entidad de prueba', networkType: 'COONECTA', active: true },
      },
    },
    context,
  );
  if (!entity.ok) throw Error(entity.error.code);
  const created = catalog.execute(
    {
      kind: 'saveAtm',
      request: {
        environment: 'QA',
        id: null,
        revision: null,
        values: {
          alias: 'Cajero Centro',
          entityId: entity.value.entities[0]!.id,
          terminalId: 'ATM-TEST',
          acquirerId: 'TEST',
          active: true,
        },
      },
    },
    context,
  );
  if (!created.ok) throw Error(created.error.code);
  const atm = created.value.atms[0]!;
  catalog.close();
  withdrawal.draft.atmId = atm.id;
  withdrawal.draft = { ...withdrawal.draft, operation: 'WITHDRAWAL', amount: '25.50' };
  await store.write(withdrawal);
  for (let i = 0; i < 21; i++) await store.write(historyRun());
  await store.close();
  let window = await launch();
  let history = window.getByRole('region', { name: 'Historial de carga', exact: true });
  await expect(history.getByRole('button', { name: 'Ver detalle', exact: false })).toHaveCount(0); // accessible names identify the run
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(20);
  await history
    .getByRole('combobox', { name: 'ATM del historial', exact: true })
    .selectOption({ label: 'Cajero Centro · ATM-TEST' });
  await history.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(1);
  await history.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await history.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(2);
  await history
    .getByRole('button', { name: `Ver corrida ${withdrawal.runId}`, exact: true })
    .click();
  let detail = history.getByRole('region', { name: 'Detalle de corrida guardada', exact: true });
  await expect(detail).toContainText('Monto por retiro: USD 25.50');
  await expect(detail).toContainText(withdrawal.items[0]!.transactionId!);
  await expect(detail).toContainText('123'.padStart(12, '0'));
  await history.getByLabel('Operación del historial').selectOption('WITHDRAWAL');
  await history.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(1);
  await history.getByLabel('Estado del historial').selectOption('FAILED');
  await history.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(history).toContainText('No hay corridas para los filtros aplicados.');
  await history.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(20);
  await app!.close();
  app = undefined;
  const updatedCatalog = new SqliteCatalog(join(directory, 'catalogs.sqlite'));
  expect(
    updatedCatalog.execute(
      { kind: 'deleteAtm', request: { environment: 'QA', id: atm.id, revision: atm.revision } },
      context,
    ).ok,
  ).toBe(true);
  updatedCatalog.close();
  window = await launch();
  history = window.getByRole('region', { name: 'Historial de carga', exact: true });
  await history.getByText('Buscar por UUID', { exact: true }).click();
  await history.getByLabel('ATM del historial (UUID)').fill('invalid');
  await history.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(history.getByRole('alert')).toContainText('Revisa el UUID');
  await history.getByLabel('ATM del historial (UUID)').fill(withdrawal.draft.atmId);
  await expect(
    history.getByRole('combobox', { name: 'ATM del historial', exact: true }),
  ).toContainText('ATM fuera del catálogo');
  await history.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(1);
  await history
    .getByRole('button', { name: `Ver corrida ${withdrawal.runId}`, exact: true })
    .click();
  detail = history.getByRole('region', { name: 'Detalle de corrida guardada', exact: true });
  await expect(detail).toContainText('Monto por retiro: USD 25.50');
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(900, 800),
  );
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test('una corrida cerrada reduce el sondeo a una consulta cada cinco segundos', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await app!.evaluate(({ ipcMain }, run) => {
    const state = globalThis as typeof globalThis & { loadReads: number };
    state.loadReads = 0;
    ipcMain.removeHandler('load:run:status');
    ipcMain.handle('load:run:status', () => {
      state.loadReads++;
      return { ok: true, value: run };
    });
  }, historyRun());
  await window.clock.install();
  try {
    await window.getByRole('button', { name: 'Carga y estrés', exact: true }).click();
    await expect(window.getByLabel('Resultado de carga')).toContainText('Completada');
    const reads = () =>
      app!.evaluate(() => (globalThis as typeof globalThis & { loadReads: number }).loadReads);
    expect(await reads()).toBe(1);
    await window.clock.fastForward(1000);
    expect(await reads()).toBe(1);
    await window.clock.fastForward(4500);
    await expect.poll(reads).toBe(2);
  } finally {
    await window.clock.resume();
  }
});

test('historial de carga: timeout, recuperación y payload inválido', async () => {
  test.setTimeout(30000);
  const window = await launch();
  const history = window.getByRole('region', { name: 'Historial de carga', exact: true });
  await expect(history).toContainText('No hay corridas para los filtros aplicados.');
  const result = await window.evaluate(() =>
    globalThis.window.desktop!.getLoadHistory({ runId: '../secret' }),
  );
  expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  await app!.evaluate(({ ipcMain }) => {
    const state = globalThis as typeof globalThis & { finishHistory?: () => void };
    ipcMain.removeHandler('load:history:list');
    ipcMain.handle(
      'load:history:list',
      () =>
        new Promise((resolve) => {
          state.finishHistory = () =>
            resolve({
              ok: false,
              error: { code: 'TIMEOUT', message: 'Consulta anterior vencida.' },
            });
        }),
    );
  });
  try {
    await history.getByRole('button', { name: 'Actualizar historial', exact: true }).click();
    await expect(history.getByRole('alert')).toContainText('no respondió a tiempo', {
      timeout: 7000,
    });
    await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(0);
    await app!.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('load:history:list');
      ipcMain.handle('load:history:list', () => ({ ok: true, value: { entries: [], next: null } }));
    });
    await history.getByRole('button', { name: 'Actualizar historial', exact: true }).click();
    await expect(history).toContainText('No hay corridas para los filtros aplicados.');
    await expect(history.getByRole('alert')).toHaveCount(0);
  } finally {
    // Release the synthetic abandoned IPC before closing Electron. Its late
    // error must not replace the recovered view from the newer request.
    await app!.evaluate(() => {
      const state = globalThis as typeof globalThis & { finishHistory?: () => void };
      state.finishHistory?.();
      delete state.finishHistory;
    });
  }
  await expect(history).toContainText('No hay corridas para los filtros aplicados.');
  await expect(history.getByRole('alert')).toHaveCount(0);
});

test('historial de carga: exporta CSV, JSON y HTML por Main, permite cancelar y muestra fallos', async () => {
  test.setTimeout(60000);
  const output = await mkdtemp(join(tmpdir(), 'load-export-e2e-'));
  try {
    const store = new SqliteLoadRunStore(
      join(directory, 'qa-load-runs.sqlite'),
      join(directory, 'qa-load-runs.json'),
    );
    const run = historyRun();
    run.draft = { ...run.draft, operation: 'WITHDRAWAL', amount: '25.50' };
    await store.write(run);
    await store.close();
    const window = await launch();
    const history = window.getByRole('region', { name: 'Historial de carga', exact: true });
    await history.getByRole('button', { name: `Ver corrida ${run.runId}`, exact: true }).click();
    const detail = history.getByRole('region', {
      name: 'Detalle de corrida guardada',
      exact: true,
    });
    for (const format of ['CSV', 'JSON', 'HTML'] as const) {
      const file = join(output, 'result.' + format.toLowerCase());
      await app!.evaluate(({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      }, file);
      await detail.getByRole('button', { name: `Exportar ${format}`, exact: true }).click();
      await expect(detail.getByRole('status')).toHaveText('Evidencia guardada.');
      const content = await readFile(file, 'utf8');
      expect(content).toContain(run.runId);
      expect(content).toContain(run.items[0]!.transactionId!);
      if (format === 'JSON')
        expect(JSON.parse(content)).toMatchObject({
          evidence: 'LOCAL_LOAD_RUN',
          run: { plan: { amount: '25.50' } },
        });
      else if (format === 'CSV') expect(content).toContain(`"${'123'.padStart(12, '0')}"`);
      else expect(content).toContain('<!doctype html>');
    }
    await mkdir('artifacts', { recursive: true });
    await history.screenshot({ path: 'artifacts/load-history-export.png' });
    const reportOpened = app!.waitForEvent('window');
    await app!.evaluate(
      async ({ BrowserWindow }, filePath) => {
        const reportWindow = new BrowserWindow({
          show: false,
          width: 1280,
          height: 1000,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
        });
        await reportWindow.loadFile(filePath);
      },
      join(output, 'result.html'),
    );
    const report = await reportOpened;
    const externalRequests: string[] = [];
    report.on('request', (request) => {
      if (/^https?:/.test(request.url())) externalRequests.push(request.url());
    });
    await report.reload();
    await expect(report.getByRole('heading', { name: 'Informe de carga y estrés' })).toBeVisible();
    await expect(report.getByRole('table')).toContainText(run.items[0]!.transactionId!);
    await expect(report.getByRole('table')).toContainText('000123');
    await expect(report.locator('body')).toContainText('USD 25.50');
    expect(await report.locator('script, iframe, img, link, form').count()).toBe(0);
    await report.screenshot({ path: 'artifacts/load-report-html.png', fullPage: true });
    await report.setViewportSize({ width: 390, height: 844 });
    expect(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await report.emulateMedia({ media: 'print' });
    await report.setViewportSize({ width: 1120, height: 790 });
    expect(await report.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(externalRequests).toEqual([]);
    await report.close();
    const existing = await readFile(join(output, 'result.json'), 'utf8');
    await app!.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
    });
    await detail.getByRole('button', { name: 'Exportar JSON', exact: true }).click();
    await expect(detail.getByRole('status')).toHaveText('Exportación cancelada.');
    expect(await readFile(join(output, 'result.json'), 'utf8')).toBe(existing);
    await app!.evaluate(
      ({ dialog }, filePath) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      },
      join(output, 'missing', 'result.json'),
    );
    await detail.getByRole('button', { name: 'Exportar JSON', exact: true }).click();
    await expect(detail.getByRole('alert')).toContainText('No se pudo guardar');
    await expect(detail.getByRole('alert')).not.toContainText(output);
    const forged = await window.evaluate(
      (runId) =>
        globalThis.window.desktop!.exportLoadRun({
          runId,
          format: 'JSON',
          path: 'private',
        } as never),
      run.runId,
    );
    expect(forged).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  } finally {
    await removeTestDirectory(output, 'load-export-e2e-');
  }
});
