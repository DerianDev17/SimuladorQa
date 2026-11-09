import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
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

async function openSettingsPage(window: Page, name: string) {
  await window
    .getByRole('navigation', { name: 'Páginas de configuración' })
    .getByRole('button', { name, exact: true })
    .click();
  await expect(
    window.getByRole('region', { name: `Página de configuración: ${name}`, exact: true }),
  ).toBeVisible();
}

async function launch(documented = true, page = 'Envío') {
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
  await expect(window.getByLabel('Ambiente', { exact: true })).toHaveText('Qa');
  await expect(window.getByRole('combobox', { name: 'Ambiente', exact: true })).toHaveCount(0);
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
  await openSettingsPage(window, page);
  return window;
}

test('configuración general: navegación, edición, validación, guardado en Qa', async () => {
  const window = await launch(true, 'Ambiente y estación');
  const form = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  const menu = window.getByRole('navigation', { name: 'Páginas de configuración' });
  await expect(menu.getByRole('button')).toHaveCount(6);
  await expect(
    window.getByRole('region', { name: 'Ambiente y estación', exact: true }),
  ).toContainText('Documentada');
  await openSettingsPage(window, 'Auditoría');
  await expect(window.getByRole('region', { name: 'Auditoría de ambientes' })).toContainText(
    'No hay cambios',
  );
  const documentUrl = window.url();
  await menu.getByRole('button', { name: 'Envío', exact: true }).focus();
  await window.keyboard.press('Enter');
  await expect(
    window.getByRole('region', { name: 'Página de configuración: Envío', exact: true }),
  ).toBeFocused();
  await expect(window.locator('.settings-content > [id]:visible')).toHaveCount(1);
  await expect(menu.getByRole('button', { name: 'Envío', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(window.url()).toBe(documentUrl);
  await form.getByLabel('Espera de conexión (ms)').fill('0');
  await expect(form.getByText('Sin guardar', { exact: true })).toBeVisible();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeVisible();
  await expect(
    menu.getByRole('button', { name: 'Ambiente y estación', exact: true }),
  ).toBeDisabled();
  await expect(
    menu.getByRole('button', { name: 'Dispositivos y perfiles', exact: true }),
  ).toBeDisabled();
  await form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('entre 1 y 30000');
  await form.getByRole('button', { name: 'Descartar cambios de envío' }).click();
  await expect(form.getByLabel('Espera de conexión (ms)')).toHaveValue('');
  await form.getByLabel('Espera de conexión (ms)').fill('1000');
  await form.getByLabel('Ventana de respuesta (ms)').fill('2000');
  await form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Configuración guardada');
  await expect(form.getByText('Revisión 2', { exact: true })).toBeVisible();
  await openSettingsPage(window, 'Ambiente y estación');
  await expect(window.getByText('Ambiente único · Pruebas del simulador')).toBeVisible();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/settings-qa-environment.png' });
  await openSettingsPage(window, 'Envío');
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

test('configuración operativa: ambiente persistido, accesos reales y recarga de catálogo', async () => {
  const window = await launch(true, 'Dispositivos y perfiles');
  const profiles = window.getByRole('region', { name: 'Perfiles y herramientas' });
  await expect(profiles).toContainText('0 ATM activos con entidad activa en QA');
  const saved = await window.evaluate(async () => {
    const api = globalThis.window.desktop!;
    const result = await api.saveEntity({
      environment: 'QA',
      id: null,
      revision: null,
      values: { code: '205', name: 'Entidad sintética', networkType: 'COONECTA', active: true },
    });
    if (!result.ok) return result.ok;
    const entity = result.value.entities.find((entry) => entry.code === '205');
    if (!entity) return false;
    return (
      await api.saveAtm({
        environment: 'QA',
        id: null,
        revision: null,
        values: {
          alias: 'ATM de prueba',
          entityId: entity.id,
          terminalId: 'ATM20521',
          acquirerId: '205',
          active: true,
        },
      })
    ).ok;
  });
  expect(saved).toBe(true);
  await profiles.getByRole('button', { name: 'Actualizar perfiles' }).click();
  await expect(profiles).toContainText('1 ATM activo con entidad activa en QA');
  await openSettingsPage(window, 'Ambiente y estación');
  await expect(window.getByRole('combobox', { name: 'Ambiente', exact: true })).toHaveCount(0);
  await openSettingsPage(window, 'Dispositivos y perfiles');
  await profiles.getByRole('button', { name: 'Administrar perfiles ATM' }).click();
  await expect(window.getByRole('heading', { name: 'Perfiles ATM', exact: true })).toBeVisible();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('catalog:list');
    ipcMain.handle('catalog:list', () => ({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', message: 'Catálogo temporalmente no disponible.' },
    }));
  });
  await profiles.getByRole('button', { name: 'Actualizar perfiles' }).click();
  await expect(profiles.getByRole('alert')).toContainText('Catálogo temporalmente no disponible');
  await expect(profiles).toContainText('Catálogo sin verificar');
});

test('configuración por páginas: contenido exclusivo, teclado y selección conservada', async () => {
  const window = await launch(true, 'Ambiente y estación');
  const documentUrl = window.url();
  const navigation = window.getByRole('navigation', { name: 'Páginas de configuración' });
  for (const name of [
    'Envío',
    'Dispositivos y perfiles',
    'Evidencia de red',
    'Requisitos',
    'Auditoría',
    'Ambiente y estación',
  ]) {
    const button = navigation.getByRole('button', { name, exact: true });
    await button.focus();
    await window.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-current', 'page');
    await expect(
      window.getByRole('region', { name: `Página de configuración: ${name}`, exact: true }),
    ).toBeFocused();
    await expect(window.locator('.settings-content > [id]:visible')).toHaveCount(1);
    expect(window.url()).toBe(documentUrl);
  }
  await openSettingsPage(window, 'Dispositivos y perfiles');
  await expect(
    navigation.getByRole('button', { name: 'Dispositivos y perfiles', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(window.locator('.settings-content > [id]:visible')).toHaveCount(1);
  await window.getByRole('button', { name: 'Inicio', exact: true }).click();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await expect(
    navigation.getByRole('button', { name: 'Dispositivos y perfiles', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await window.setViewportSize({ width: 1440, height: 1000 });
  await window.screenshot({ path: 'artifacts/settings-devices-page.png' });
});

test('configuración operativa: comprobar lector, ausencia y timeout sin leer el chip', async () => {
  const window = await launch(true, 'Dispositivos y perfiles');
  const reader = window.getByRole('region', { name: 'Comprobación del lector' });
  await expect(reader).toContainText('Sin comprobar en esta pantalla');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => ({
      ok: true,
      value: {
        checkedAt: new Date().toISOString(),
        readers: [{ name: 'Lector de prueba', state: 'CARD_PRESENT', atr: null }],
        identityStatus: 'NOT_READ',
      },
    }));
    ipcMain.removeHandler('reader:identity:read');
    ipcMain.handle('reader:identity:read', () => {
      throw Error('UNEXPECTED_CHIP_READ');
    });
  });
  await reader.getByRole('button', { name: 'Comprobar lector' }).click();
  await expect(reader.getByRole('status')).toContainText('Lector de prueba');
  await expect(reader).toContainText('Tarjeta presente');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => ({
      ok: true,
      value: { checkedAt: new Date().toISOString(), readers: [], identityStatus: 'NOT_READ' },
    }));
  });
  await reader.getByRole('button', { name: 'Comprobar lector' }).click();
  await expect(reader.getByRole('status')).toContainText('No se detectaron lectores');
  await expect(reader).not.toContainText('Lector de prueba');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => new Promise(() => {}));
  });
  await reader.getByRole('button', { name: 'Comprobar lector' }).click();
  await expect(reader.getByRole('button', { name: 'Comprobando…', exact: true })).toBeDisabled();
  await expect(reader.getByRole('alert')).toContainText('no respondió a tiempo', {
    timeout: 15000,
  });
  await expect(reader).not.toContainText('Última comprobación');
  await expect(reader.getByRole('button', { name: 'Comprobar lector' })).toBeEnabled();
});

test('configuración operativa: conectar y desconectar requieren una acción explícita', async () => {
  const window = await launch(true, 'Dispositivos y perfiles');
  await app!.evaluate(({ ipcMain }) => {
    let connected = false;
    const value = () => ({
      environment: 'QA',
      connectionId: null,
      state: connected ? 'CONNECTED' : 'DISCONNECTED',
      endpoint: null,
      localEndpoint: null,
      connectedAt: null,
      disconnectedAt: null,
      observedAt: new Date().toISOString(),
      reason: null,
      bytesReceived: 0,
      networkMessage: null,
    });
    for (const action of ['status', 'connect', 'disconnect'])
      ipcMain.removeHandler(`switch:connection:${action}`);
    ipcMain.handle('switch:connection:status', () => ({ ok: true, value: value() }));
    ipcMain.handle('switch:connection:connect', () => {
      connected = true;
      return { ok: true, value: value() };
    });
    ipcMain.handle('switch:connection:disconnect', () => {
      connected = false;
      return { ok: true, value: value() };
    });
  });
  const link = window.getByRole('region', { name: 'Conexión al Switch', exact: true });
  await expect(link.getByRole('status')).toContainText('Desconectado');
  await link.getByRole('button', { name: 'Conectar al Switch' }).click();
  await expect(link.getByRole('status')).toContainText('TCP conectado');
  await link.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(link.getByRole('status')).toContainText('Desconectado');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('switch:connection:connect');
    ipcMain.handle('switch:connection:connect', () => ({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Destino no disponible.' },
    }));
  });
  await link.getByRole('button', { name: 'Conectar al Switch' }).click();
  await expect(link.getByRole('alert')).toContainText('Destino no disponible');
});

test('configuración operativa: descarta comprobaciones del lector al salir de Configuración', async () => {
  const window = await launch(true, 'Dispositivos y perfiles');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle(
      'reader:inspect',
      () =>
        new Promise((resolveResult) => {
          const state = globalThis as typeof globalThis & { finishSettingsReader?: () => void };
          state.finishSettingsReader = () =>
            resolveResult({
              ok: true,
              value: {
                checkedAt: new Date().toISOString(),
                readers: [{ name: 'Lector anterior', state: 'CARD_PRESENT', atr: null }],
                identityStatus: 'NOT_READ',
              },
            });
        }),
    );
  });
  const reader = window.getByRole('region', { name: 'Comprobación del lector' });
  await reader.getByRole('button', { name: 'Comprobar lector' }).click();
  await expect(reader.getByRole('status')).toContainText('Comprobando lector');
  await window.getByRole('button', { name: 'Inicio', exact: true }).click();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await app!.evaluate(() =>
    (
      globalThis as typeof globalThis & { finishSettingsReader?: () => void }
    ).finishSettingsReader?.(),
  );
  await expect(reader.getByRole('status')).toContainText('Sin comprobar en esta pantalla');
  await expect(reader).not.toContainText('Lector anterior');
});

test('configuración general: evidencia ausente mantiene ajustes bloqueados y navegación disponible', async () => {
  const window = await launch(false);
  const form = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  await expect(form).toContainText('se necesita evidencia de un destino');
  await expect(form.getByLabel('Modo previsto')).toBeDisabled();
  await expect(
    form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }),
  ).toBeDisabled();
  await openSettingsPage(window, 'Requisitos');
  await expect(
    window.getByRole('region', { name: 'Página de configuración: Requisitos', exact: true }),
  ).toBeFocused();
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
