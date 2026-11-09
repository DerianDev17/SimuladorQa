import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { networkEvidence } from '../helpers/network-evidence';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let app: ElectronApplication | undefined;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-settings-e2e-'));
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await removeTestDirectory(directory, 'coonecta-settings-e2e-');
});

async function launch(documented = true) {
  if (documented)
    await writeFile(join(directory, 'network-evidence.json'), JSON.stringify(networkEvidence()));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  app = await electron.launch({
    args: [resolve('dist/main.cjs'), `--user-data-dir=${directory}`, '--simulate-reader'],
    env,
  });
  const window = await app.firstWindow();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
  await expect(window.getByLabel('Modo previsto')).toBeVisible();
  return window;
}

test('configuración general: navegación, edición, validación, guardado y aislamiento', async () => {
  const window = await launch();
  const form = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  const menu = window.getByRole('navigation', { name: 'Secciones de configuración' });
  await expect(menu.getByRole('link')).toHaveCount(5);
  await expect(window.getByRole('region', { name: 'Ambiente y estación' })).toContainText(
    'Documentada',
  );
  await expect(window.getByRole('region', { name: 'Auditoría de ambientes' })).toContainText(
    'No hay cambios',
  );
  const documentUrl = window.url();
  await menu.getByRole('link', { name: 'Envío', exact: true }).focus();
  await window.keyboard.press('Enter');
  await expect(window.locator('#settings-send')).toBeFocused();
  expect(window.url()).toBe(documentUrl);
  await form.getByLabel('Espera de conexión (ms)').fill('0');
  await expect(form.getByText('Sin guardar', { exact: true })).toBeVisible();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('entre 1 y 30000');
  await form.getByRole('button', { name: 'Descartar cambios de envío' }).click();
  await expect(form.getByLabel('Espera de conexión (ms)')).toHaveValue('');
  await form.getByLabel('Espera de conexión (ms)').fill('1000');
  await form.getByLabel('Ventana de respuesta (ms)').fill('2000');
  await form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Configuración guardada');
  await expect(form.getByText('Revisión 2', { exact: true })).toBeVisible();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(form).toContainText('Sin destino documentado');
  await expect(form.getByLabel('Espera de conexión (ms)')).toHaveValue('');
  await expect(
    form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }),
  ).toBeDisabled();
  await expect(
    window
      .getByRole('region', { name: 'Auditoría de ambientes' })
      .getByRole('cell', { name: 'QA → PREPROD' }),
  ).toBeVisible();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await expect(form.getByLabel('Espera de conexión (ms)')).toHaveValue('1000');
  await expect(window.getByRole('button', { name: 'Conectar', exact: true })).toBeEnabled();
  await window.setViewportSize({ width: 1440, height: 1080 });
  await window.evaluate(() => globalThis.scrollTo(0, 0));
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/settings-desktop.png' });
  await window.setViewportSize({ width: 1000, height: 800 });
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await window.screenshot({ path: 'artifacts/settings-compact.png' });
});

test('configuración general: evidencia ausente mantiene ajustes bloqueados y navegación disponible', async () => {
  const window = await launch(false);
  const form = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  await expect(form).toContainText('se necesita evidencia de un destino');
  await expect(form.getByLabel('Modo previsto')).toBeDisabled();
  await expect(
    form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }),
  ).toBeDisabled();
  await window.getByRole('link', { name: 'Requisitos', exact: true }).click();
  await expect(window.locator('#settings-requirements')).toBeFocused();
  await window.getByRole('button', { name: 'Inicio', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
});

test('configuración general: timeout de guardado obliga a reconciliar antes de reintentar', async () => {
  const window = await launch();
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:send:configure');
    ipcMain.handle('transaction:send:configure', () => new Promise(() => {}));
  });
  const form = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  await form.getByLabel('Espera de conexión (ms)').fill('1200');
  const save = form.getByRole('button', { name: 'Guardar configuración de envío', exact: true });
  await save.click();
  await expect(form.getByRole('alert')).toContainText('no respondió a tiempo', { timeout: 10000 });
  await expect(save).toBeDisabled();
  await expect(form.getByLabel('Espera de conexión (ms)')).toBeDisabled();
  await form.getByRole('button', { name: 'Descartar cambios de envío' }).click();
  await form.getByRole('button', { name: 'Recargar envío' }).click();
  await expect(form.getByLabel('Espera de conexión (ms)')).toBeEnabled();
  await expect(form.getByLabel('Espera de conexión (ms)')).toHaveValue('');
});
