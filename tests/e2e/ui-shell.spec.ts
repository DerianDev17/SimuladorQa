import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { removeTestDirectory } from '../helpers/temporary-directory';

let directory: string;
let app: ElectronApplication | undefined;
let window: Page;

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-ui-shell-'));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  app = await electron.launch({
    args: [resolve('dist/main.cjs'), `--user-data-dir=${directory}`, '--simulate-reader'],
    env,
  });
  window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
  await expect(navigation().getByRole('button', { name: 'Transacciones' })).toBeEnabled();
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await removeTestDirectory(directory, 'coonecta-ui-shell-');
});

function navigation() {
  return window.getByRole('navigation', { name: 'Navegación principal' });
}

test('navegación compacta: nombres, teclado, foco y contenido sin desbordar', async () => {
  await window.keyboard.press('Tab');
  await expect(window.getByRole('button', { name: 'Ir al contenido' })).toBeFocused();
  const documentUrl = window.url();
  await window.keyboard.press('Enter');
  await expect(window.getByRole('main')).toBeFocused();
  expect(window.url()).toBe(documentUrl);

  for (const width of [1040, 680, 480]) {
    await window.setViewportSize({ width, height: 640 });
    for (const name of [
      'Inicio',
      'Transacciones',
      'Carga y estrés',
      'Perfiles ATM',
      'Tarjetas',
      'Entidades',
      'Monitor',
      'Observación',
      'Configuración',
    ]) {
      await expect(navigation().getByRole('button', { name, exact: true })).toHaveCount(1);
    }
    for (const name of [
      'Transacciones',
      'Entidades',
      'Perfiles ATM',
      'Tarjetas',
      'Carga y estrés',
      'Observación',
      'Monitor',
      'Configuración',
      'Inicio',
    ]) {
      const button = navigation().getByRole('button', { name, exact: true });
      await button.focus();
      await window.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-current', 'page');
      await expect(window.getByRole('main')).toHaveAttribute('aria-label', name);
      await expect
        .poll(() =>
          window.evaluate(() => document.querySelector('main')?.contains(document.activeElement)),
        )
        .toBe(true);
      await expect
        .poll(() =>
          window.evaluate(
            () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
          ),
        )
        .toBe(true);
      await expect(window.getByLabel('Ambiente', { exact: true })).toBeInViewport();
      if (width === 680) await window.screenshot({ path: `artifacts/ui-${name}.png` });
    }
  }
});

test('cambiar de sección vuelve al inicio y conserva el borrador de transacción', async () => {
  await navigation().getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByLabel('Monto de prueba').fill('37.50');
  await window.evaluate(() => globalThis.scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => window.evaluate(() => globalThis.scrollY)).toBeGreaterThan(0);
  await navigation().getByRole('button', { name: 'Monitor', exact: true }).click();
  await expect.poll(() => window.evaluate(() => globalThis.scrollY)).toBe(0);
  await expect(window.getByRole('main')).toBeFocused();
  await navigation().getByRole('button', { name: 'Transacciones', exact: true }).click();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('37.50');
});

test('edición bloqueada explica cómo salir y conserva errores de validación', async () => {
  await navigation().getByRole('button', { name: 'Entidades', exact: true }).click();
  await window.getByRole('button', { name: 'Nueva entidad', exact: true }).click();
  await expect(window.getByRole('status').filter({ hasText: 'Guarda o cancela' })).toBeVisible();
  await expect(navigation().getByRole('button', { name: 'Inicio', exact: true })).toBeDisabled();
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(window.getByLabel('Código de entidad', { exact: true })).toBeFocused();
  await expect(window.getByLabel('Código de entidad', { exact: true })).toHaveAttribute(
    'required',
    '',
  );
  await window.getByLabel('Código de entidad', { exact: true }).fill('   ');
  await window.getByLabel('Nombre de entidad', { exact: true }).fill('Entidad de prueba');
  await window.getByLabel('Red de entidad').selectOption('COONECTA');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(window.getByRole('alert')).toContainText('Completa el código');
  await expect(navigation().getByRole('button', { name: 'Inicio', exact: true })).toBeDisabled();
  await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(window.getByText('Guarda o cancela la edición')).toHaveCount(0);
  await expect(navigation().getByRole('button', { name: 'Inicio', exact: true })).toBeEnabled();
});

test('conexión: acción pendiente correcta, error y timeout recuperables', async () => {
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
    for (const action of ['connect', 'disconnect']) {
      ipcMain.handle(
        `switch:connection:${action}`,
        () =>
          new Promise((resolveResult) => {
            const state = globalThis as typeof globalThis & { finishUiConnection?: () => void };
            state.finishUiConnection = () => {
              connected = action === 'connect';
              resolveResult({ ok: true, value: value() });
            };
          }),
      );
    }
  });
  await navigation().getByRole('button', { name: 'Configuración', exact: true }).click();
  await window.getByRole('button', { name: 'Dispositivos y perfiles', exact: true }).click();
  const panel = window.getByRole('region', { name: 'Conexión al Switch', exact: true });
  await panel.getByRole('button', { name: 'Conectar al Switch' }).click();
  await expect(window.getByRole('button', { name: 'Conectando…', exact: true })).toHaveCount(2);
  await app!.evaluate(() =>
    (globalThis as typeof globalThis & { finishUiConnection?: () => void }).finishUiConnection?.(),
  );
  await expect(panel.getByRole('status')).toContainText('TCP conectado');
  await panel.getByRole('button', { name: 'Desconectar', exact: true }).click();
  await expect(window.getByRole('button', { name: 'Desconectando…', exact: true })).toHaveCount(2);
  await expect(panel.getByRole('button')).toBeDisabled();
  await app!.evaluate(() =>
    (globalThis as typeof globalThis & { finishUiConnection?: () => void }).finishUiConnection?.(),
  );
  await expect(panel.getByRole('status')).toContainText('Desconectado');

  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('switch:connection:connect');
    ipcMain.handle('switch:connection:connect', () => ({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Destino no disponible.' },
    }));
  });
  await panel.getByRole('button', { name: 'Conectar al Switch' }).click();
  await expect(panel.getByRole('alert')).toContainText('Destino no disponible');
  await expect(panel.getByRole('button')).toBeEnabled();
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('switch:connection:connect');
    ipcMain.handle('switch:connection:connect', () => new Promise(() => {}));
  });
  await panel.getByRole('button', { name: 'Conectar al Switch' }).click();
  await expect(panel.getByRole('button', { name: 'Conectando…', exact: true })).toBeDisabled();
  await expect(panel.getByRole('alert')).toContainText('no respondió a tiempo', { timeout: 8000 });
  await expect(panel.getByRole('button', { name: 'Conectar al Switch' })).toBeEnabled();
});
