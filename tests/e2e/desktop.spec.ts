import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { Environment } from '../../packages/domain/src/index';
import { createServer } from 'vite';

let directory: string;
let app: ElectronApplication | undefined;

async function launch(development = false) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  app = await electron.launch({
    args: [
      resolve('dist/main.cjs'),
      `--user-data-dir=${directory}`,
      ...(development ? ['--dev'] : []),
    ],
    env,
  });
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'Tu estación de pruebas' })).toBeVisible();
  return window;
}

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-e2e-'));
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await rm(directory, { recursive: true, force: true });
});

test('dashboard real, aislamiento, navegación y gate transaccional', async () => {
  const window = await launch();
  await expect(window.getByText('Servicios locales activos', { exact: true })).toBeVisible();
  await expect(window.getByLabel('Ambiente', { exact: true })).toHaveValue('QA');
  const csp = await window
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("connect-src 'none'");
  expect(csp).not.toContain('unsafe-inline');
  expect(
    await window
      .locator('.sidebar-bottom')
      .evaluate((element) => element.getBoundingClientRect().bottom <= globalThis.innerHeight),
  ).toBe(true);
  expect(
    await window.evaluate(() => ({
      node: 'process' in globalThis.window,
      require: 'require' in globalThis.window,
    })),
  ).toEqual({ node: false, require: false });
  expect(
    await app?.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .filter((metric) => metric.type === 'Tab')
        .map((metric) => metric.sandboxed),
    ),
  ).toEqual([true]);
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/dashboard.png', fullPage: true });
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByText('Envío bloqueado · QA')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
  await window
    .getByRole('combobox', { name: 'Transacción', exact: true })
    .selectOption('TIMEOUT_REVERSAL');
  await expect(window.getByText('Envío bloqueado · QA')).toHaveCount(0);
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(
    window.getByText('Especificación: docs/transactions/TIMEOUT_REVERSAL.md'),
  ).toBeVisible();
  for (const name of [
    'Perfiles ATM',
    'Tarjetas',
    'Carga y estrés',
    'Monitor',
    'Historial',
    'Configuración',
  ]) {
    await window.getByRole('button', { name, exact: true }).click();
    await expect(window.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  const invalid = await window.evaluate(() =>
    globalThis.window.desktop?.setEnvironment('PROD' as Environment),
  );
  expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  await expect(window.getByLabel('Ambiente', { exact: true })).toHaveValue('QA');
  const pageErrors: string[] = [];
  window.on('pageerror', (error) => pageErrors.push(error.message));
  await window.reload();
  await expect(window.getByText('Servicios locales activos', { exact: true })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('PREPROD y su auditoría persisten entre reinicios', async () => {
  let window = await launch();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(
    window.getByText('Ambiente PREPROD · Configuración y límites independientes de QA.'),
  ).toBeVisible();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await expect(window.getByRole('cell', { name: 'QA → PREPROD', exact: true })).toBeVisible();
  await app?.close();
  app = undefined;
  window = await launch();
  await expect(window.getByLabel('Ambiente', { exact: true })).toHaveValue('PREPROD');
  await expect(
    window.getByText('Ambiente PREPROD · Configuración y límites independientes de QA.'),
  ).toBeVisible();
});

test('configuración corrupta muestra error seguro y bloquea preparación', async () => {
  await writeFile(join(directory, 'preferences.json'), '{private-secret');
  const window = await launch();
  await expect(window.getByRole('alert')).toContainText('No se pudo leer la configuración local');
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await expect(window.getByRole('button', { name: 'Revisar requisitos' })).toBeDisabled();
  await expect(window.getByText('private-secret')).toHaveCount(0);
  await window.getByRole('button', { name: 'Reintentar' }).click();
  await expect(window.getByRole('alert')).toBeVisible();
  expect(await readFile(join(directory, 'preferences.json'), 'utf8')).toBe('{private-secret');
});

test('modo desarrollo carga React y el puente IPC con Vite', async () => {
  const server = await createServer({ configFile: resolve('vite.config.ts') });
  await server.listen();
  try {
    const window = await launch(true);
    const errors: string[] = [];
    window.on('pageerror', (error) => errors.push(error.message));
    await expect(window.getByText('Servicios locales activos', { exact: true })).toBeVisible();
    await window.reload();
    await expect(window.getByText('Servicios locales activos', { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    await expect(window.getByLabel('Ambiente', { exact: true })).toHaveValue('QA');
  } finally {
    await app?.close();
    app = undefined;
    await server.close();
  }
});
