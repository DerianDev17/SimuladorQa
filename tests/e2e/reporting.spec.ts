import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SqliteLoadRunStore } from '../../apps/desktop/src/main/infrastructure/sqlite-load-run-store';
import { historyRun } from '../helpers/load-history';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let app: ElectronApplication | undefined;
let window: Page;
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-reporting-'));
  const store = new SqliteLoadRunStore(
    join(directory, 'qa-load-runs.sqlite'),
    join(directory, 'qa-load-runs.json'),
  );
  await store.write(historyRun());
  await store.close();
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
  window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await removeTestDirectory(directory, 'coonecta-reporting-');
});
async function openReporting() {
  await window
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Reportería y auditoría', exact: true })
    .click();
  await expect(window.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
}
test('centraliza reportes y auditoría reales, filtra, pagina y mantiene los detalles', async () => {
  test.setTimeout(60000);
  const errors: string[] = [];
  window.on('pageerror', (error) => errors.push(error.message));
  const draft = historyRun().draft;
  await window.evaluate(async (plan) => {
    const api = globalThis.window.desktop!;
    for (let index = 0; index < 17; index++) {
      const result = await api.saveEntity({
        environment: 'QA',
        id: null,
        revision: null,
        values: {
          code: `R-${index}`,
          name: `Entidad de prueba ${index}`,
          networkType: 'COONECTA',
          active: true,
        },
      });
      if (!result.ok) throw Error(result.error.code);
    }
    const load = await api.saveLoadConfiguration({
      id: null,
      revision: null,
      name: 'Plan de prueba',
      draft: plan,
    });
    if (!load.ok) throw Error(load.error.code);
    const saved = load.value[0]!;
    const deleted = await api.deleteLoadConfiguration({ id: saved.id, revision: saved.revision });
    if (!deleted.ok) throw Error(deleted.error.code);
    const send = await api.saveSendConfiguration({
      environment: 'QA',
      revision: null,
      endpoint: { host: '127.0.0.1', port: 16104 },
      values: {
        evidenceId: null,
        trigger: 'ON_CLICK',
        connectDeadlineMs: 1300,
        observationWindowMs: 2300,
      },
    });
    if (!send.ok) throw Error(send.error.code);
  }, draft);
  for (const name of [
    'Entidades',
    'Perfiles ATM',
    'Configuración',
    'Transacciones',
    'Carga y estrés',
  ]) {
    await window
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('button', { name, exact: true })
      .click();
    await expect(window.getByRole('region', { name: 'Historial local', exact: true })).toHaveCount(
      0,
    );
    await expect(
      window.getByRole('region', { name: 'Historial de carga', exact: true }),
    ).toHaveCount(0);
    await expect(window.getByRole('heading', { name: 'Actividad del catálogo' })).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Auditoría', exact: true })).toHaveCount(0);
  }
  await openReporting();
  await expect(window.getByRole('button', { name: 'Observación', exact: true })).toHaveCount(0);
  await expect(window.locator('.reporting-metrics')).toContainText('20');
  await expect(
    window.getByRole('region', { name: 'Reportes de carga', exact: true }),
  ).toContainText('Completada');
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1600, 1100),
  );
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/reporting-summary.png', fullPage: true });
  await window.setViewportSize({ width: 480, height: 900 });
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await window.screenshot({ path: 'artifacts/reporting-summary-compact.png', fullPage: true });
  await window.setViewportSize({ width: 1600, height: 1100 });
  await window.getByRole('tab', { name: 'Auditoría', exact: true }).click();
  const audit = window.getByRole('region', { name: 'Actividad de auditoría', exact: true });
  await expect(audit.getByRole('button', { name: /^Ver evento / })).toHaveCount(15);
  await audit.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(audit.getByRole('button', { name: /^Ver evento / })).toHaveCount(5);
  await window.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('send');
  await window.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(audit.getByRole('button', { name: /^Ver evento / })).toHaveCount(1);
  await audit.getByRole('button', { name: /^Ver evento / }).click();
  await expect(audit.getByRole('region', { name: 'Detalle del evento' })).toContainText(
    'Conexión: 1300 ms',
  );
  await window.getByLabel('Desde (hora local)', { exact: true }).fill('2026-11-14T00:00');
  await window.getByLabel('Hasta (exclusivo)', { exact: true }).fill('2026-11-13T00:00');
  await window.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(window.getByRole('alert')).toContainText('Desde debe ser anterior');
  await expect(audit.getByRole('button', { name: /^Ver evento / })).toHaveCount(1);
  await window.getByRole('button', { name: 'Limpiar', exact: true }).click();
  await window.getByRole('combobox', { name: 'Origen', exact: true }).selectOption('load');
  await window.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(audit.getByRole('button', { name: /^Ver evento / })).toHaveCount(2);
  await expect(audit).toContainText('Eliminación');
  await window.getByLabel('Buscar', { exact: true }).fill('sin coincidencias');
  await window.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(audit).toContainText('No hay eventos en los registros disponibles');
  await window.getByRole('tab', { name: 'Reportes', exact: true }).click();
  const history = window.getByRole('region', { name: 'Historial de carga', exact: true });
  await history.getByRole('button', { name: /^Ver corrida / }).click();
  await expect(history.getByRole('button', { name: 'Exportar CSV', exact: true })).toBeEnabled();
  await window.getByRole('tab', { name: 'Mediator', exact: true }).click();
  await expect(
    window.getByRole('region', { name: 'Consulta de Mediator', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('un timeout retira auditoría obsoleta y actualizar recupera la fuente', async () => {
  await openReporting();
  const send = await window.evaluate(() => globalThis.window.desktop!.getSendConfiguration('QA'));
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:send:configuration');
    ipcMain.handle('transaction:send:configuration', () => new Promise(() => {}));
  });
  await window.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(window.getByRole('alert')).toContainText(
    'Configuración de envío: El servicio local no respondió a tiempo',
    { timeout: 10000 },
  );
  await expect(window.locator('.reporting-metrics > div').nth(2)).toContainText('—');
  await expect(
    window.getByRole('region', { name: 'Reportes de carga', exact: true }),
  ).toContainText('Completada');
  await app!.evaluate(({ ipcMain }, response) => {
    ipcMain.removeHandler('transaction:send:configuration');
    ipcMain.handle('transaction:send:configuration', () => response);
  }, send);
  await window.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(window.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  await expect(window.getByRole('alert')).toHaveCount(0);
});
