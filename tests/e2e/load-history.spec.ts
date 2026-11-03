import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SqliteLoadRunStore } from '../../apps/desktop/src/main/infrastructure/sqlite-load-run-store';
import { historyRun } from '../helpers/load-history';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let app: ElectronApplication | undefined;
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'load-history-e2e-'));
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
  withdrawal.draft = { ...withdrawal.draft, operation: 'WITHDRAWAL', amount: '25.50' };
  await store.write(withdrawal);
  for (let i = 0; i < 21; i++) await store.write(historyRun());
  await store.close();
  let window = await launch();
  let history = window.getByRole('region', { name: 'Historial de carga', exact: true });
  await expect(history.getByRole('button', { name: 'Ver detalle', exact: false })).toHaveCount(0); // accessible names identify the run
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(20);
  await history.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(history.getByRole('button', { name: /^Ver corrida / })).toHaveCount(2);
  await history
    .getByRole('button', { name: `Ver corrida ${withdrawal.runId}`, exact: true })
    .click();
  let detail = history.getByRole('region', { name: 'Detalle de corrida guardada', exact: true });
  await expect(detail).toContainText('Monto por retiro: USD 25.50');
  await expect(detail).toContainText(withdrawal.items[0]!.transactionId!);
  await expect(detail).toContainText('000000000123');
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
  window = await launch();
  history = window.getByRole('region', { name: 'Historial de carga', exact: true });
  await history.getByLabel('ATM del historial (UUID)').fill(withdrawal.draft.atmId);
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
    ipcMain.removeHandler('load:history:list');
    ipcMain.handle('load:history:list', () => new Promise(() => {}));
  });
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
});
