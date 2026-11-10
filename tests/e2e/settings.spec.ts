import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import type { AddressInfo, Socket } from 'node:net';
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
  await expect(window.getByRole('region', { name: 'Auditoría de envío' })).toContainText(
    'Revisión 1',
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
  await openSettingsPage(window, 'Auditoría');
  const audit = window.getByRole('region', { name: 'Auditoría de envío' });
  await expect(audit.getByRole('row').nth(1)).toContainText('Revisión 2');
  await expect(audit.getByRole('row').nth(1)).toContainText('Conexión: 1000 ms');
  await expect(audit.getByRole('row').nth(1)).toContainText('Respuesta: 2000 ms');
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/settings-send-audit.png' });
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

test('configuración operativa: destino editable sin evidencia, persistencia y conexión TCP local', async () => {
  const peers = new Set<Socket>();
  let connections = 0;
  let bytes = 0;
  const server = createServer((peer) => {
    connections++;
    peers.add(peer);
    peer.on('error', () => {});
    peer.on('data', (chunk) => {
      bytes += chunk.length;
    });
    peer.on('close', () => peers.delete(peer));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = String((server.address() as AddressInfo).port);
  try {
    const window = await launch(false);
    const form = window.getByRole('region', { name: 'Configuración de envío', exact: true });
    await expect(form.getByLabel('Modo previsto')).toHaveCount(0);
    await form.getByLabel('Dirección IP del Switch').fill('999.0.0.1');
    await form.getByLabel('Puerto del Switch').fill(port);
    await form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText('IPv4 válida');
    await form.getByLabel('Dirección IP del Switch').fill('127.0.0.1');
    await form.getByLabel('Espera de conexión (ms)').fill('1500');
    await form.getByLabel('Ventana de respuesta (ms)').fill('2500');
    await form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }).click();
    await expect(form.getByRole('status')).toContainText('Configuración guardada');
    expect(connections).toBe(0);
    await app!.close();
    app = undefined;
    const restarted = await launch(false);
    const savedForm = restarted.getByRole('region', {
      name: 'Configuración de envío',
      exact: true,
    });
    await expect(savedForm.getByLabel('Dirección IP del Switch')).toHaveValue('127.0.0.1');
    await expect(savedForm.getByLabel('Puerto del Switch')).toHaveValue(port);
    await expect(savedForm.getByLabel('Espera de conexión (ms)')).toHaveValue('1500');
    await expect(savedForm.getByLabel('Ventana de respuesta (ms)')).toHaveValue('2500');
    expect(connections).toBe(0);
    await openSettingsPage(restarted, 'Dispositivos y perfiles');
    const link = restarted.getByRole('region', { name: 'Conexión al Switch', exact: true });
    await link.getByRole('button', { name: 'Conectar al Switch' }).click();
    await expect(link.getByRole('status')).toContainText('TCP conectado');
    expect(connections).toBe(1);
    await openSettingsPage(restarted, 'Envío');
    await savedForm.getByLabel('Espera de conexión (ms)').fill('1600');
    await savedForm
      .getByRole('button', { name: 'Guardar configuración de envío', exact: true })
      .click();
    await expect(savedForm.getByRole('status')).toContainText('Configuración guardada');
    await openSettingsPage(restarted, 'Dispositivos y perfiles');
    await expect(link.getByRole('status')).toContainText('Desconectado');
    await expect.poll(() => peers.size).toBe(0);
    expect(connections).toBe(1);
    expect(bytes).toBe(0);
  } finally {
    for (const peer of peers) peer.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
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

test('configuración operativa: requisitos reflejan ajustes actuales y permiten corregirlos', async () => {
  const window = await launch(false, 'Requisitos');
  const checks = window.getByRole('region', { name: 'Requisitos de configuración' });
  await expect(checks).toContainText('Falta guardar IP y puerto');
  await expect(checks).toContainText('0 ATM con entidad activa');
  await checks.getByRole('button', { name: 'Configurar envío', exact: true }).click();
  const form = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  await form.getByLabel('Dirección IP del Switch').fill('127.0.0.1');
  await form.getByLabel('Puerto del Switch').fill('16104');
  await form.getByLabel('Espera de conexión (ms)').fill('1300');
  await form.getByLabel('Ventana de respuesta (ms)').fill('2300');
  await form.getByRole('button', { name: 'Guardar configuración de envío', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('Configuración guardada');
  await openSettingsPage(window, 'Requisitos');
  await expect(checks.getByRole('listitem').filter({ hasText: 'Destino de envío' })).toContainText(
    '127.0.0.1:16104',
  );
  await expect(checks.getByRole('listitem').filter({ hasText: 'Plazo de conexión' })).toContainText(
    '1300 ms',
  );
  await expect(
    checks.getByRole('listitem').filter({ hasText: 'Plazo de respuesta' }),
  ).toContainText('2300 ms');
  await expect(checks.getByRole('listitem').filter({ hasText: 'Conexión TCP' })).toContainText(
    'Desconectado',
  );
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/settings-operational-checks.png' });
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:send:configuration');
    ipcMain.handle('transaction:send:configuration', () => ({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE', message: 'Configuración temporalmente no disponible.' },
    }));
  });
  await checks.getByRole('button', { name: 'Actualizar comprobaciones' }).click();
  await expect(checks.getByRole('alert')).toContainText(
    'Configuración temporalmente no disponible',
  );
  await expect(checks.getByRole('listitem').filter({ hasText: 'Destino de envío' })).toContainText(
    'Sin verificar',
  );
  await expect(checks).not.toContainText('127.0.0.1:16104');
  await checks.getByRole('button', { name: 'Revisar perfiles ATM' }).click();
  await expect(window.getByRole('heading', { name: 'Perfiles ATM', exact: true })).toBeVisible();
});

test('configuración operativa: auditoría vacía y timeout retiran datos sin ocultar el error', async () => {
  const window = await launch(false, 'Auditoría');
  const audit = window.getByRole('region', { name: 'Auditoría de envío' });
  await expect(audit).toContainText('No hay configuraciones de envío guardadas');
  expect(
    await window.evaluate(
      async () =>
        (
          await globalThis.window.desktop!.saveSendConfiguration({
            environment: 'QA',
            revision: null,
            endpoint: { host: '127.0.0.1', port: 16104 },
            values: {
              evidenceId: null,
              trigger: 'ON_CLICK',
              connectDeadlineMs: 1300,
              observationWindowMs: 2300,
            },
          })
        ).ok,
    ),
  ).toBe(true);
  await audit.getByRole('button', { name: 'Actualizar auditoría' }).click();
  await expect(audit.getByRole('table')).toContainText('127.0.0.1:16104');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:send:configuration');
    ipcMain.handle('transaction:send:configuration', () => new Promise(() => {}));
  });
  await audit.getByRole('button', { name: 'Actualizar auditoría' }).click();
  await expect(audit.getByRole('alert')).toContainText('no respondió a tiempo', { timeout: 10000 });
  await expect(audit).not.toContainText('No hay configuraciones de envío guardadas');
  await expect(audit.getByRole('table')).toHaveCount(0);
  await expect(audit).not.toContainText('127.0.0.1:16104');
  await expect(audit.getByRole('button', { name: 'Actualizar auditoría' })).toBeEnabled();
});
