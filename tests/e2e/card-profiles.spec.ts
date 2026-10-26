import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { removeTestDirectory } from '../helpers/temporary-directory';

let app: ElectronApplication;
let directory: string;
test.beforeAll(async () => {
  await mkdir('artifacts', { recursive: true });
  await build({
    entryPoints: ['tests/helpers/card-profile-electron.ts'],
    outfile: 'artifacts/card-profile-electron.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
});
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-card-ui-'));
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
  await expect(
    window.getByRole('heading', { name: 'Estación de pruebas', exact: true }),
  ).toBeVisible();
  await app.evaluate(
    ({ ipcMain, BrowserWindow }, options) => {
      const require = process.getBuiltinModule('module').createRequire(options.fixture);
      require(options.fixture).install(ipcMain, options.file);
      BrowserWindow.getAllWindows()[0]?.setContentSize(1366, 768);
    },
    {
      fixture: resolve('artifacts/card-profile-electron.cjs'),
      file: join(directory, 'qa-card-profiles.json'),
    },
  );
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
});
test.afterEach(async () => {
  await app?.close();
  await removeTestDirectory(directory, 'coonecta-card-ui-');
});

test('guardar el alias sugerido persiste, se recupera y permite editar y eliminar', async () => {
  const window = await app.firstWindow();
  const save = window.getByRole('button', { name: 'Guardar tarjeta', exact: true });
  await expect(save).toBeDisabled();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(window.getByLabel('Alias de la tarjeta QA')).toHaveValue('VISA DEBITO - 2267');
  await expect(save).toBeEnabled();
  const bounds = await save.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThan(768);
  await window.screenshot({ path: 'artifacts/cards-ready.png' });
  await save.click();
  await expect(
    window.getByText('Tarjeta «VISA DEBITO - 2267» guardada en este equipo.'),
  ).toBeVisible();
  const inventory = window.getByRole('region', { name: 'Tarjetas guardadas', exact: true });
  await expect(inventory).toContainText('VISA DEBITO - 2267');
  const persisted = JSON.parse(await readFile(join(directory, 'qa-card-profiles.json'), 'utf8'));
  expect(persisted.profiles).toHaveLength(1);
  expect(persisted.profiles[0].lastFour).toBe('2267');
  expect(persisted.profiles[0]).not.toHaveProperty('panMasked');
  await window.reload();
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  await expect(inventory).toContainText('VISA DEBITO - 2267');
  await window.screenshot({ path: 'artifacts/cards-saved.png' });
  await inventory.getByRole('button', { name: 'Editar perfil VISA DEBITO - 2267' }).click();
  await window.getByLabel('Editar alias de tarjeta').fill('Visa pruebas');
  await window.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(inventory).toContainText('Visa pruebas');
  await inventory.getByRole('button', { name: 'Eliminar perfil Visa pruebas' }).click();
  await expect(inventory).toContainText('Todavía no guardaste');
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1024, 768),
  );
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await window.screenshot({ path: 'artifacts/cards-small.png' });
});

test('alias inválido, tarjeta retirada y dependencia no disponible tienen respuesta visible', async () => {
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  const alias = window.getByLabel('Alias de la tarjeta QA');
  const save = window.getByRole('button', { name: 'Guardar tarjeta', exact: true });
  await alias.fill('VISA · •••• 2267');
  await expect(save).toBeDisabled();
  await expect(window.getByRole('alert')).toContainText('Usa de 2 a 40 caracteres');
  await alias.fill('Visa prueba');
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:profiles:save');
    ipcMain.handle('reader:profiles:save', () => ({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'El inventario local no está disponible.',
      },
    }));
  });
  await save.click();
  await expect(window.getByRole('alert')).toContainText('El inventario local no está disponible.');
  await expect(save).toBeEnabled();
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:profiles:save');
    ipcMain.handle('reader:profiles:save', () => new Promise(() => {}));
  });
  await save.click();
  await expect(window.getByRole('alert')).toContainText('no respondió a tiempo', { timeout: 8000 });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]!.webContents.send('reader:changed', {
      ok: true,
      value: {
        checkedAt: new Date().toISOString(),
        readers: [],
        identityStatus: 'NOT_READ',
      },
    });
  });
  await expect(save).toBeDisabled();
  await expect(alias).toHaveValue('');
});
