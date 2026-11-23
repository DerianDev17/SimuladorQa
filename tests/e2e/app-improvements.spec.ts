import { launchTestDesktop } from '../helpers/electron-launch';
import { test, expect } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import { SqliteLoadRunStore } from '../../apps/desktop/src/main/infrastructure/sqlite-load-run-store';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { historyRun } from '../helpers/load-history';
import type { LoadRunSnapshot } from '../../packages/domain/src/load-run';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let app: ElectronApplication | undefined;
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'app-improvements-'));
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await removeTestDirectory(directory, 'app-improvements-');
});
async function launch(): Promise<Page> {
  app = await launchTestDesktop(directory);
  const page = await app.firstWindow();
  await expect(page.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
  return page;
}
async function mediator(page: Page) {
  await page.getByRole('button', { name: 'Reportería y auditoría', exact: true }).click();
  await page.getByRole('tab', { name: 'Mediator', exact: true }).click();
  return page.getByRole('region', { name: 'Consulta de Mediator', exact: true });
}

test('historial completo: página antigua, búsqueda, fechas y conservación ante timeout', async () => {
  test.setTimeout(60000);
  const journal = new SqliteBalanceJournal(
    join(directory, 'balance-executions.sqlite'),
    join(directory, 'balance-executions.json'),
  );
  const items = Array.from({ length: 62 }, (_, index) => {
    const item = approvedWithdrawalExecution();
    delete item.withdrawal;
    item.startedAt = new Date(Date.UTC(2026, 10, 1, 0, index)).toISOString();
    item.finishedAt = new Date(Date.parse(item.startedAt) + 250).toISOString();
    item.correlation!.stan = String(index).padStart(6, '0');
    return item;
  });
  await journal.write(items);
  await journal.close();
  const page = await launch();
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Transacciones', exact: true })
    .click();
  await page.getByRole('button', { name: 'Abrir historial de transacciones', exact: true }).click();
  await page.getByRole('button', { name: 'Buscar en todo el historial', exact: true }).click();
  const history = page.getByRole('region', { name: 'Historial completo', exact: true });
  await expect(history.locator('tbody tr')).toHaveCount(50);
  await history.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(history.locator('tbody tr')).toHaveCount(12);
  await history
    .getByRole('button', { name: 'Abrir operación histórica 000000', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Detalle de transacción guardada', exact: true }),
  ).toContainText('000000');
  // The selected archive record is also visible in the local list. Selecting
  // that row must retain its snapshot even though it is outside recent(50).
  await page.getByRole('button', { name: 'Abrir operación 000000', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Detalle de transacción guardada', exact: true }),
  ).toContainText('000000');
  await page.getByRole('button', { name: 'Actualizar historial', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Actualizar historial', exact: true }),
  ).toBeEnabled();
  await page.getByRole('button', { name: 'Abrir operación 000000', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Detalle de transacción guardada', exact: true }),
  ).toContainText('000000');
  await history.getByLabel('Referencia en todo el historial').fill(items[0]!.requestId);
  await history.getByRole('button', { name: 'Buscar historial completo' }).click();
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await history.getByLabel('Desde (hora local)', { exact: true }).fill('2026-11-03T00:00');
  await history
    .getByLabel('Hasta (exclusivo, hora local)', { exact: true })
    .fill('2026-11-02T00:00');
  await history.getByRole('button', { name: 'Buscar historial completo' }).click();
  await expect(history.getByRole('alert')).toContainText('Hasta debe ser posterior');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:history:page');
    ipcMain.handle('transaction:history:page', () => new Promise(() => {}));
  });
  await history.getByRole('button', { name: 'Actualizar página' }).click();
  await expect(history.getByRole('alert')).toContainText('no respondió a tiempo', {
    timeout: 10000,
  });
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await page.setViewportSize({ width: 1024, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await mkdir('artifacts', { recursive: true });
  await history.screenshot({ path: 'artifacts/transaction-history-complete.png' });
});

test('un fallo de depósitos se identifica correctamente', async () => {
  const page = await launch();
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:deposit:history');
    ipcMain.handle('transaction:deposit:history', () => ({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', message: 'Fuente no disponible.' },
    }));
  });
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Transacciones', exact: true })
    .click();
  await page.getByRole('button', { name: 'Abrir historial de transacciones', exact: true }).click();
  await expect(page.locator('.history-warning')).toContainText('Depósitos: Fuente no disponible.');
});

test('carga conserva tabla, detalle y cursor tras error y timeout de actualización', async () => {
  test.setTimeout(60000);
  const store = new SqliteLoadRunStore(
    join(directory, 'qa-load-runs.sqlite'),
    join(directory, 'qa-load-runs.json'),
  );
  const run = historyRun();
  await store.write(run);
  await store.close();
  const page = await launch();
  await page.getByRole('button', { name: 'Reportería y auditoría', exact: true }).click();
  await page.getByRole('tab', { name: 'Reportes', exact: true }).click();
  const history = page.getByRole('region', { name: 'Historial de carga', exact: true });
  await history.getByRole('button', { name: `Ver corrida ${run.runId}`, exact: true }).click();
  const detail = history.getByRole('region', { name: 'Detalle de corrida guardada', exact: true });
  await expect(detail).toContainText(run.runId);
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('load:history:detail');
    ipcMain.handle('load:history:detail', () => ({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', message: 'No disponible.' },
    }));
    ipcMain.removeHandler('load:history:list');
    ipcMain.handle('load:history:list', () => new Promise(() => {}));
  });
  await history.getByRole('button', { name: 'Actualizar detalle', exact: true }).click();
  await expect(history.getByRole('alert')).toContainText('Se conserva');
  await expect(detail).toContainText(run.runId);
  await history.getByRole('button', { name: 'Actualizar historial', exact: true }).click();
  await expect(history.getByRole('alert')).toContainText('no respondió a tiempo', {
    timeout: 10000,
  });
  await expect(detail).toContainText(run.runId);
  await expect(
    history.getByRole('button', { name: `Ver corrida ${run.runId}`, exact: true }),
  ).toBeVisible();
});

test('Mediator recuerda el intervalo SQL después de reiniciar', async () => {
  // Two Electron launches and graceful shutdown share this test's deadline.
  test.setTimeout(60000);
  let page = await launch();
  let view = await mediator(page);
  await expect(view.getByLabel('Desde (hora SQL)', { exact: true })).toHaveValue('');
  await view.getByLabel('Desde (hora SQL)', { exact: true }).fill('2026-11-19 01:00:00.000');
  await view.getByLabel('Hasta (hora SQL)', { exact: true }).fill('2026-11-19 02:00:00.000');
  await view.getByRole('button', { name: 'Consultar Mediator' }).click();
  await expect(view.getByRole('alert')).toBeVisible();
  await app!.close();
  app = undefined;
  page = await launch();
  view = await mediator(page);
  await expect(view.getByLabel('Desde (hora SQL)', { exact: true })).toHaveValue(
    '2026-11-19 01:00:00.000',
  );
  await expect(view.getByLabel('Hasta (hora SQL)', { exact: true })).toHaveValue(
    '2026-11-19 02:00:00.000',
  );
});

test('recupera un error de render solo tras comprobar Main y no ejecuta transacciones', async () => {
  test.setTimeout(60000);
  const page = await launch();
  const catalog = await page.evaluate(() => window.desktop!.getCatalog('QA'));
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('catalog:list');
    ipcMain.handle('catalog:list', () => ({
      ok: true,
      value: { environment: 'QA', atms: null, entities: [], cases: [] },
    }));
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'La interfaz necesita recuperarse' }),
  ).toBeVisible();
  await app!.evaluate(({ ipcMain }, value) => {
    ipcMain.removeHandler('catalog:list');
    ipcMain.handle('catalog:list', () => value);
    ipcMain.removeHandler('app:renderer:recovery');
    ipcMain.handle('app:renderer:recovery', () => ({
      ok: true,
      value: { busy: true, recent: [] },
    }));
    for (const operation of ['balance', 'withdrawal', 'deposit']) {
      ipcMain.removeHandler(`transaction:${operation}:execute`);
      ipcMain.handle(`transaction:${operation}:execute`, () => {
        throw Error('UNEXPECTED_FINANCIAL_COMMAND');
      });
    }
  }, catalog);
  await page.getByRole('button', { name: 'Consultar estado de operaciones' }).click();
  await expect(page.getByRole('alert')).toContainText('operación activa');
  await expect(
    page.getByRole('button', { name: 'Recuperar interfaz y revisar historial' }),
  ).toHaveCount(0);
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('app:renderer:recovery');
    ipcMain.handle('app:renderer:recovery', () => new Promise(() => {}));
  });
  await page.getByRole('button', { name: 'Consultar estado de operaciones' }).click();
  await expect(page.getByRole('alert')).toContainText('a tiempo', { timeout: 10000 });
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('app:renderer:recovery');
    ipcMain.handle('app:renderer:recovery', () => ({
      ok: true,
      value: { busy: false, recent: [] },
    }));
  });
  await page.getByRole('button', { name: 'Consultar estado de operaciones' }).click();
  await page.getByRole('button', { name: 'Recuperar interfaz y revisar historial' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva transacción', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir historial de transacciones', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Historial local', exact: true })).toBeVisible();
});

interface RecoveryLoadProbe {
  run: LoadRunSnapshot | null;
  requests: string[];
  mode: 'timeout' | 'error' | 'success';
  financialCommands: number;
}

test('recuperación conserva Stop con carga activa, errores y timeout sin repetir comandos', async () => {
  test.setTimeout(60000);
  const page = await launch();
  const catalog = await page.evaluate(() => window.desktop!.getCatalog('QA'));
  const run = historyRun({ state: 'RUNNING', finishedAt: null, active: 1 });
  await app!.evaluate(({ ipcMain }, run) => {
    const probe: RecoveryLoadProbe = { run, requests: [], mode: 'timeout', financialCommands: 0 };
    (globalThis as typeof globalThis & { recoveryLoadProbe: RecoveryLoadProbe }).recoveryLoadProbe =
      probe;
    ipcMain.removeHandler('load:run:status');
    ipcMain.handle('load:run:status', () => ({ ok: true, value: probe.run }));
    ipcMain.removeHandler('load:run:stop');
    ipcMain.handle('load:run:stop', (_event, request: { runId: string }) => {
      probe.requests.push(request.runId);
      if (probe.mode === 'timeout') return new Promise(() => {});
      if (probe.mode === 'error')
        return {
          ok: false,
          error: { code: 'SERVICE_UNAVAILABLE', message: 'Parada no disponible.' },
        };
      probe.run = { ...probe.run!, state: 'STOPPING' };
      return { ok: true, value: probe.run };
    });
    ipcMain.removeHandler('app:renderer:recovery');
    ipcMain.handle('app:renderer:recovery', () => ({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', message: 'Historial no disponible.' },
    }));
    for (const channel of [
      'transaction:balance:execute',
      'transaction:withdrawal:execute',
      'transaction:deposit:execute',
      'load:run:start',
    ]) {
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, () => {
        probe.financialCommands++;
        return { ok: false, error: { code: 'FORBIDDEN', message: 'No se debe iniciar.' } };
      });
    }
    ipcMain.removeHandler('catalog:list');
    ipcMain.handle('catalog:list', () => ({
      ok: true,
      value: { environment: 'QA', atms: null, entities: [], cases: [] },
    }));
  }, run);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'La interfaz necesita recuperarse' }),
  ).toBeVisible();
  const controls = page.getByRole('region', { name: 'Carga durante recuperación' });
  const stop = controls.getByRole('button', { name: 'Detener prueba', exact: true });
  await expect(stop).toBeEnabled();
  await page.getByRole('button', { name: 'Consultar estado de operaciones' }).click();
  await expect(page.getByText('Historial no disponible.', { exact: true })).toBeVisible();
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(controls.getByRole('button', { name: 'Solicitando parada…' })).toBeDisabled();
  await expect(controls.getByRole('alert')).toContainText('Actualiza el estado de carga', {
    timeout: 10000,
  });
  await expect(stop).toBeDisabled();
  expect(
    await app!.evaluate(
      () =>
        (globalThis as typeof globalThis & { recoveryLoadProbe: RecoveryLoadProbe })
          .recoveryLoadProbe.requests,
    ),
  ).toEqual([run.runId]);
  await app!.evaluate(() => {
    (
      globalThis as typeof globalThis & { recoveryLoadProbe: RecoveryLoadProbe }
    ).recoveryLoadProbe.mode = 'error';
  });
  await controls.getByRole('button', { name: 'Actualizar estado de carga' }).click();
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(controls.getByRole('alert')).toContainText('Parada no disponible.');
  await expect(stop).toBeDisabled();
  await app!.evaluate(() => {
    (
      globalThis as typeof globalThis & { recoveryLoadProbe: RecoveryLoadProbe }
    ).recoveryLoadProbe.mode = 'success';
  });
  await controls.getByRole('button', { name: 'Actualizar estado de carga' }).click();
  await stop.click();
  await expect(
    controls.getByRole('button', { name: 'Parada en curso', exact: true }),
  ).toBeDisabled();
  await app!.evaluate(({ ipcMain }, catalog) => {
    const probe = (globalThis as typeof globalThis & { recoveryLoadProbe: RecoveryLoadProbe })
      .recoveryLoadProbe;
    probe.run = null;
    ipcMain.removeHandler('app:renderer:recovery');
    ipcMain.handle('app:renderer:recovery', () => ({
      ok: true,
      value: { busy: false, recent: [] },
    }));
    ipcMain.removeHandler('catalog:list');
    ipcMain.handle('catalog:list', () => catalog);
  }, catalog);
  await controls.getByRole('button', { name: 'Actualizar estado de carga' }).click();
  await expect(controls.getByRole('button', { name: 'Parada en curso' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Consultar estado de operaciones' }).click();
  await page.getByRole('button', { name: 'Recuperar interfaz y revisar historial' }).click();
  await expect(page.getByRole('heading', { name: 'Nueva transacción', exact: true })).toBeVisible();
  expect(
    await app!.evaluate(() => {
      const probe = (globalThis as typeof globalThis & { recoveryLoadProbe: RecoveryLoadProbe })
        .recoveryLoadProbe;
      return { requests: probe.requests, financialCommands: probe.financialCommands };
    }),
  ).toEqual({ requests: [run.runId, run.runId, run.runId], financialCommands: 0 });
});
