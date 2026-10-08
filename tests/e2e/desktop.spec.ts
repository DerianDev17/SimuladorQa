import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { Environment } from '../../packages/domain/src/index';
import type {
  CardIdentityReading,
  CardReaderSnapshot,
} from '../../packages/domain/src/card-reader';
import type { Result } from '../../packages/shared/src/contracts';
import { createServer } from 'vite';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { networkEvidence } from '../helpers/network-evidence';

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

test('lector PC/SC usa IPC protegido y mantiene separada la identidad', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  await expect(window.getByRole('region', { name: 'Estado del lector' })).toBeVisible();
  await expect(window.getByText('La presencia de la tarjeta', { exact: false })).toBeVisible();
  const api = await window.evaluate(() => ({
    available: typeof globalThis.window.desktop?.getReaderSnapshot === 'function',
    nodeAvailable: 'require' in globalThis.window,
  }));
  expect(api).toEqual({ available: true, nodeAvailable: false });
  const result = await window.evaluate(() => globalThis.window.desktop?.getReaderSnapshot());
  if (result?.ok) {
    expect(result.value.identityStatus).toBe('NOT_READ');
    expect(result.value).not.toHaveProperty('pan');
    expect(result.value.readers.length).toBeLessThanOrEqual(16);
  } else {
    expect(result?.error.code).toMatch(/SERVICE_UNAVAILABLE|TIMEOUT/);
  }
  await expect(window.getByText('Consultando lector…')).toHaveCount(0);
  const readerPanel = window.getByRole('region', { name: 'Estado del lector' });
  await expect(readerPanel.getByRole('heading', { name: 'Datos de la tarjeta' })).toBeVisible();
  await expect(readerPanel.locator('.detected-card')).toBeVisible();
  await expect(readerPanel.getByText('No leído', { exact: true })).toHaveCount(3);
  const refresh = readerPanel.getByRole('button', { name: 'Actualizar', exact: true });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(refresh).toBeEnabled({ timeout: 15000 });
  const devices = readerPanel.locator('.reader-device');
  if (await devices.count()) {
    await devices.last().click();
    await expect(devices.last()).toHaveAttribute('aria-pressed', 'true');
  }
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/card-reader-desktop.png', fullPage: true });
  await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1024, 768),
  );
  expect(
    await window.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.window.innerWidth,
    ),
  ).toBe(true);
  await expect(readerPanel.locator('.detected-card')).toBeVisible();
});

test('tarjeta visual sigue inserción, retiro y recuperación con IPC sintético', async () => {
  const window = await launch();
  const readers: CardReaderSnapshot['readers'] = [
    { name: 'CI Contact', state: 'EMPTY', atr: null },
    { name: 'CI Contactless', state: 'CARD_PRESENT', atr: '3B00' },
  ];
  const setResult = async (result: Result<CardReaderSnapshot>) => {
    await app!.evaluate(({ ipcMain }, response) => {
      ipcMain.removeHandler('reader:inspect');
      ipcMain.handle('reader:inspect', () => response);
    }, result);
  };
  const success = (devices: CardReaderSnapshot['readers']): Result<CardReaderSnapshot> => ({
    ok: true,
    value: { checkedAt: '2026-10-08T20:00:00.000Z', readers: devices, identityStatus: 'NOT_READ' },
  });
  await setResult(success(readers));
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  const panel = window.getByRole('region', { name: 'Estado del lector' });
  await expect(panel.locator('.detected-card.is-present')).toBeVisible();
  await expect(panel.locator('.card-atr')).toHaveText('3B 00');
  await panel.getByRole('button', { name: 'CI Contact Sin tarjeta' }).click();
  await expect(panel.locator('.detected-card.is-empty')).toBeVisible();
  await expect(panel.locator('.card-atr')).toHaveText('Sin lectura');
  await panel.getByRole('button', { name: 'CI Contactless Tarjeta presente' }).click();
  await expect(panel.locator('.card-atr')).toHaveText('3B 00');
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/card-reader-detected.png', fullPage: true });
  const refresh = panel.getByRole('button', { name: 'Actualizar', exact: true });
  await setResult(success([{ name: 'CI Contactless', state: 'EMPTY', atr: null }]));
  await refresh.click();
  await expect(panel.locator('.detected-card.is-empty')).toBeVisible();
  await expect(panel.locator('.card-atr')).toHaveText('Sin lectura');
  await setResult({
    ok: false,
    error: { code: 'TIMEOUT', message: 'El lector no respondió a tiempo.' },
  });
  await refresh.click();
  await expect(panel.getByRole('alert')).toHaveText('El lector no respondió a tiempo.');
  await expect(panel.locator('.reader-device')).toHaveCount(0);
  await setResult(success(readers));
  await refresh.click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.locator('.detected-card.is-present')).toBeVisible();
  await expect(panel.locator('.card-atr')).toHaveText('3B 00');
  await setResult(success([]));
  await refresh.click();
  await expect(panel.locator('.card-reader-status')).toContainText('No hay lectores conectados');
  await expect(panel.locator('.card-atr')).toHaveText('Sin lectura');
});

test('lectura manual muestra identidad protegida y valida país en la pantalla', async () => {
  const window = await launch();
  const reading: CardIdentityReading = {
    readId: '2b86d181-9efb-4808-b8a8-876a843876b8',
    readAt: '2026-10-08T20:00:00.000Z',
    readerName: 'CI Reader',
    status: 'READ',
    applications: [],
    applicationId: null,
    applicationLabel: 'QA CARD',
    panMasked: '*'.repeat(12) + '4444',
    cardholderName: 'QA TESTER',
    expiry: '12/29',
  };
  await app!.evaluate(({ ipcMain }, identity) => {
    let current: typeof identity | null = null;
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => ({
      ok: true,
      value: {
        checkedAt: identity.readAt,
        identityStatus: current ? 'READ' : 'NOT_READ',
        readers: [{ name: identity.readerName, state: 'CARD_PRESENT', atr: '3B00' }],
        identity: current,
      },
    }));
    ipcMain.removeHandler('reader:identity:read');
    ipcMain.handle('reader:identity:read', (_event, request) => {
      if (request.terminalCountryCode !== '218' || request.readerName !== identity.readerName)
        return { ok: false, error: { code: 'VALIDATION_ERROR', message: 'País inválido.' } };
      current = identity;
      return { ok: true, value: identity };
    });
  }, reading);
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  const panel = window.getByRole('region', { name: 'Estado del lector' });
  const country = panel.getByLabel('País del terminal (ISO numérico)');
  await expect(country).toHaveValue('218');
  const read = panel.getByRole('button', { name: 'Leer datos del chip', exact: true });
  await country.fill('xx');
  await read.click();
  await expect(panel.getByRole('alert')).toContainText('tres dígitos');
  await expect(panel.getByText('QA TESTER', { exact: true })).toHaveCount(0);
  await country.fill('218');
  await read.click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByText('Leído del chip', { exact: true })).toBeVisible();
  await expect(panel.locator('.detected-card')).toContainText('QA TESTER');
  await expect(panel.locator('.detected-card')).toContainText('12/29');
  await expect(panel.locator('.detected-card')).toContainText(reading.panMasked!);
  await panel.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(panel.locator('.detected-card')).toContainText(reading.panMasked!);
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/card-identity-synthetic.png', fullPage: true });
});

test('composición del mockup: tres paneles y resumen dentro de la ventana desktop', async () => {
  const window = await launch();
  await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1536, 1024),
  );
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await expect(
    window.getByRole('button', { name: 'Recargar perfiles', exact: true }),
  ).toBeEnabled();
  const composition = await window.evaluate(() => {
    const bounds = (selector: string) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    };
    return {
      context: bounds('.transaction-context'),
      flow: bounds('.transaction-flow'),
      inspector: bounds('.transaction-inspector'),
      recent: bounds('.transaction-bottom-grid'),
      support: bounds('.transaction-support-grid'),
      viewport: globalThis.window.innerHeight,
      overflow: document.documentElement.scrollWidth > globalThis.window.innerWidth,
    };
  });
  expect(composition.context.top).toBe(composition.flow.top);
  expect(composition.flow.top).toBe(composition.inspector.top);
  expect(composition.context.right).toBeLessThan(composition.flow.left);
  expect(composition.flow.right).toBeLessThan(composition.inspector.left);
  expect(composition.recent.bottom).toBeLessThan(composition.viewport);
  expect(composition.support.top).toBeGreaterThan(composition.recent.bottom);
  expect(composition.overflow).toBe(false);
  await expect(window.getByLabel('Ambiente', { exact: true })).toHaveValue('QA');
  await expect(
    window.getByRole('button', { name: 'Guardar como caso', exact: true }),
  ).toBeDisabled();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/mockup-aligned-desktop.png', scale: 'css' });
  await window.getByRole('button', { name: 'Ver todas', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Historial', exact: true })).toBeVisible();
});

test('muestra evidencia de capturas sin habilitar envío ni RAW', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  const evidence = window.getByLabel('Evidencia de capturas');
  await expect(evidence.getByRole('heading', { name: '10 archivos · 218 mensajes' })).toBeVisible();
  await expect(evidence.getByText('2 bytes, big endian; incluye el prefijo')).toBeVisible();
  await evidence.getByText('Ver archivos y MTI', { exact: true }).click();
  await expect(evidence.locator('li')).toHaveCount(10);
  await expect(evidence.getByText('Formato pendiente de identificar')).toHaveCount(6);
  await expect(
    evidence.getByText('CertificacionMandatoVisa29092026_CRBanred.pcap', { exact: true }),
  ).toBeVisible();
  await expect(window.getByRole('tab', { name: 'RAW', exact: true })).toBeDisabled();
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(evidence.getByRole('heading', { name: '10 archivos · 218 mensajes' })).toBeVisible();
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/capture-evidence.png', fullPage: true });
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await removeTestDirectory(directory, 'coonecta-e2e-');
});

test('Configuración muestra evidencia documental QA sin conectar ni heredarla en PREPROD', async () => {
  await writeFile(join(directory, 'network-evidence.json'), JSON.stringify(networkEvidence()));
  const window = await launch();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  const evidence = window.getByLabel('Evidencia de red del Switch', { exact: true });
  await expect(evidence.getByRole('heading', { name: 'Destino ATM documentado' })).toBeVisible();
  await expect(evidence.getByText('10.0.0.11:16100', { exact: true })).toBeVisible();
  await expect(evidence.getByText('PID 80131 · TCP01 · VISA', { exact: true })).toBeVisible();
  await expect(evidence.getByText('Sin conexión comprobada', { exact: true })).toBeVisible();
  await expect(
    evidence.getByText('Esta PC; acceso desde su IP pendiente de validar'),
  ).toBeVisible();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/switch-network-evidence-test.png', fullPage: true });
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(evidence.getByRole('status')).toContainText(
    'No hay evidencia de red cargada para PREPROD',
  );
  await expect(evidence.getByText('10.0.0.11:16100', { exact: true })).toHaveCount(0);
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await expect(evidence.getByText('10.0.0.11:16100', { exact: true })).toBeVisible();
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
});

test('evidencia de red corrupta muestra error seguro sin impedir usar el shell', async () => {
  await writeFile(join(directory, 'network-evidence.json'), '{private-secret');
  const window = await launch();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  const evidence = window.getByLabel('Evidencia de red del Switch', { exact: true });
  await expect(evidence.getByRole('alert')).toContainText(
    'No se pudo validar la evidencia local de red',
  );
  await expect(window.getByText('private-secret')).toHaveCount(0);
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(window.getByLabel('Ambiente', { exact: true })).toHaveValue('PREPROD');
});

test('Historial: consulta Mediator validada, QA bloqueado y dependencia no configurada', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Historial', exact: false }).click();
  const observer = window.getByLabel('Consulta de Mediator', { exact: true });
  await expect(
    observer.getByRole('heading', { name: 'Transacciones y mensajes de Mediator' }),
  ).toBeVisible();
  await expect(observer.getByRole('button', { name: 'Consultar Mediator' })).toBeDisabled();
  await expect(observer.getByText('Selecciona PREPROD para consultar Mediator.')).toBeVisible();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(observer.getByLabel('Entidad', { exact: true })).toHaveValue('205');
  await expect(observer.getByLabel('Canal', { exact: true })).toHaveValue('1');
  await expect(observer.getByLabel('Desde (hora SQL)', { exact: true })).toHaveValue(
    '2026-09-29 00:00:07.803',
  );
  await observer.getByLabel('Hasta (hora SQL)', { exact: true }).fill('2026-09-30 23:00:07.803');
  await observer.getByRole('button', { name: 'Consultar Mediator' }).click();
  await expect(observer.getByRole('alert')).toContainText('hasta 24 horas');
  await observer.getByLabel('Hasta (hora SQL)', { exact: true }).fill('2026-09-29 23:00:07.803');
  await expect(observer.getByRole('alert')).toHaveCount(0);
  await observer.getByRole('button', { name: 'Consultar Mediator' }).click();
  await expect(observer.getByRole('alert')).toContainText('configuración local de Mediator', {
    timeout: 20_000,
  });
  await expect(observer.locator('tbody tr')).toHaveCount(0);
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await expect(observer.getByRole('alert')).toHaveCount(0);
  await expect(observer.getByRole('button', { name: 'Consultar Mediator' })).toBeDisabled();
  await expect(observer.locator('pre')).toHaveCount(0);
  await mkdir('artifacts', { recursive: true });
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await window.screenshot({ path: 'artifacts/mediator-observer.png', fullPage: true });
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
    'Entidades',
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

async function createTestEntity(window: Page) {
  await window.getByRole('button', { name: 'Entidades', exact: true }).click();
  await window.getByRole('button', { name: 'Nueva entidad' }).click();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await window.getByLabel('Código de entidad').fill('TEST-E2E');
  await window.getByLabel('Nombre de entidad').fill('Entidad sintética E2E');
  await window.getByLabel('Red de entidad').selectOption('COONECTA');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(
    window.getByRole('cell', { name: 'Entidad sintética E2E', exact: true }),
  ).toBeVisible();
}

async function createTestAtm(window: Page, alias: string) {
  await window.getByRole('button', { name: 'Perfiles ATM', exact: true }).click();
  await window.getByRole('button', { name: 'Nuevo perfil ATM' }).click();
  await window.getByLabel('Alias ATM').fill(alias);
  await window
    .getByLabel('Entidad del ATM')
    .selectOption({ label: 'TEST-E2E · Entidad sintética E2E' });
  await window.getByLabel('Terminal ID', { exact: true }).fill('Test-Terminal');
  await window.getByLabel('Acquirer ID', { exact: true }).fill('Test-Acquirer');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('button', { name: `Editar ${alias}`, exact: true })).toBeVisible();
}

test('casos locales: validación, reinicio, carga, separación de ambientes y eliminación', async () => {
  let window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de casos');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de casos · Borrador' });
  await window.getByLabel('Escenario', { exact: true }).selectOption('BANRED');
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await expect(
    window.getByRole('button', { name: 'Guardar como caso', exact: true }),
  ).toBeDisabled();
  await window.getByLabel('Cuenta', { exact: true }).selectOption('CURRENT');
  await window.getByLabel('Monto de prueba').fill('100.50');
  await window.getByRole('button', { name: 'Guardar como caso', exact: true }).click();
  let dialog = window.getByRole('dialog');
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await dialog.getByLabel('Nombre del caso').fill('0000 '.repeat(4).trim());
  await dialog.getByRole('button', { name: 'Guardar caso', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('sin datos de tarjeta');
  await dialog.getByLabel('Nombre del caso').fill('Retiro sintético corriente');
  await dialog.getByRole('button', { name: 'Guardar caso', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    window.getByRole('button', { name: 'Casos guardados (1)', exact: true }),
  ).toBeVisible();
  await app?.close();
  app = undefined;
  window = await launch();
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window.getByRole('button', { name: 'Casos guardados (1)', exact: true }).click();
  dialog = window.getByRole('dialog');
  await expect(dialog.getByText('Retiro sintético corriente', { exact: true })).toBeVisible();
  await dialog.getByText('Referencias documentales', { exact: true }).click();
  await expect(dialog.getByText('docs/protocols/PCAP_REVIEW.md', { exact: true })).toBeVisible();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/saved-cases-library.png', scale: 'css' });
  await dialog
    .getByRole('button', { name: 'Cargar Retiro sintético corriente', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue(
    'WITHDRAWAL_APPROVED',
  );
  await expect(window.getByLabel('Cuenta', { exact: true })).toHaveValue('CURRENT');
  await expect(window.getByLabel('Escenario', { exact: true })).toHaveValue('BANRED');
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).not.toHaveValue('');
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
  await expect(window.getByLabel('Contexto revisado', { exact: true })).toHaveCount(0);
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByText('Envío bloqueado · QA')).toBeVisible();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await window.getByRole('button', { name: 'Casos guardados (0)', exact: true }).click();
  await expect(dialog.getByText('Aún no hay casos guardados en este ambiente.')).toBeVisible();
  await window.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await window.getByRole('button', { name: 'Casos guardados (1)', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Eliminar caso Retiro sintético corriente', exact: true })
    .click();
  await dialog.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
  await expect(dialog.getByText('Aún no hay casos guardados en este ambiente.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await window.getByRole('button', { name: 'Entidades', exact: true }).click();
  await expect(window.getByRole('cell', { name: 'Caso', exact: true })).toHaveCount(2);
});

test('un caso con ATM editado conserva cuenta/monto y exige seleccionar el perfil actual', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de caso obsoleto');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de caso obsoleto · Borrador' });
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_DECLINED');
  await window.getByLabel('Monto de prueba').fill('50.00');
  await window.getByRole('button', { name: 'Guardar como caso', exact: true }).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByLabel('Nombre del caso').fill('Caso obsoleto');
  await dialog.getByRole('button', { name: 'Guardar caso', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const changed = await window.evaluate(async () => {
    const api = globalThis.window.desktop!;
    const result = await api.getCatalog('QA');
    if (!result.ok) throw new Error('Catalog unavailable');
    const atm = result.value.atms[0]!;
    return api.saveAtm({
      environment: 'QA',
      id: atm.id,
      revision: atm.revision,
      values: {
        alias: 'ATM de caso actualizado',
        entityId: atm.entityId,
        terminalId: atm.terminalId,
        acquirerId: atm.acquirerId,
        active: true,
      },
    });
  });
  expect(changed.ok).toBe(true);
  await window.getByRole('button', { name: 'Casos guardados (1)', exact: true }).click();
  await expect(dialog.getByText('ATM pendiente de seleccionar de nuevo.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cargar Caso obsoleto', exact: true }).click();
  await expect(
    window.getByText(
      'El ATM guardado cambió o no está disponible. Selecciona un perfil actual y vuelve a revisar los requisitos.',
    ),
  ).toBeVisible();
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('50.00');
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue(
    'WITHDRAWAL_DECLINED',
  );
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de caso actualizado · Borrador' });
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByLabel('Contexto revisado', { exact: true })).toContainText('versión 2');
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
});

test('fallo al guardar un caso exige recargar antes de reintentar', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de guardado concurrente');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de guardado concurrente · Borrador' });
  await window.getByRole('button', { name: 'Guardar como caso', exact: true }).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByLabel('Nombre del caso').fill('Caso concurrente');
  const changed = await window.evaluate(async () => {
    const api = globalThis.window.desktop!;
    const result = await api.getCatalog('QA');
    if (!result.ok) throw new Error('Catalog unavailable');
    const atm = result.value.atms[0]!;
    return api.saveAtm({
      environment: 'QA',
      id: atm.id,
      revision: atm.revision,
      values: {
        alias: atm.alias,
        entityId: atm.entityId,
        terminalId: atm.terminalId,
        acquirerId: atm.acquirerId,
        active: false,
      },
    });
  });
  expect(changed.ok).toBe(true);
  await dialog.getByRole('button', { name: 'Guardar caso', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('El ATM cambió');
  await expect(dialog.getByRole('button', { name: 'Guardar caso', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Revisar casos guardados', exact: true }).click();
  await expect(dialog.getByText('Aún no hay casos guardados en este ambiente.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(
    window.getByRole('button', { name: 'Guardar como caso', exact: true }),
  ).toBeDisabled();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeEnabled();
});

test('una recarga fallida de casos bloquea la lista anterior hasta recuperar la base', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de recuperación de casos');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de recuperación de casos · Borrador' });
  await window.getByRole('button', { name: 'Guardar como caso', exact: true }).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByLabel('Nombre del caso').fill('Caso de recuperación');
  await dialog.getByRole('button', { name: 'Guardar caso', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const lock = new DatabaseSync(join(directory, 'catalogs.sqlite'));
  try {
    lock.exec('BEGIN EXCLUSIVE');
    await window.getByRole('button', { name: 'Casos guardados (1)', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('ocupado');
    await expect(
      dialog.getByRole('button', { name: 'Cargar Caso de recuperación', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Eliminar caso Caso de recuperación', exact: true }),
    ).toBeDisabled();
    lock.exec('ROLLBACK');
    await dialog.getByRole('button', { name: 'Recargar casos', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(
      dialog.getByRole('button', { name: 'Cargar Caso de recuperación', exact: true }),
    ).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cargar Caso de recuperación', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(window.getByLabel('Perfil ATM', { exact: true })).not.toHaveValue('');
  } finally {
    lock.close();
  }
});

test('una entrada sensible rechazada no guarda silenciosamente el valor previo de una entidad', async () => {
  const window = await launch();
  await createTestEntity(window);
  await window.getByRole('button', { name: 'Editar TEST-E2E', exact: true }).click();
  await window.getByLabel('Código de entidad').fill('0'.repeat(16));
  await expect(window.getByRole('alert')).toContainText('No incluyas datos de tarjeta');
  await expect(window.getByLabel('Código de entidad')).toHaveValue('');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  const result = await window.evaluate(() => globalThis.window.desktop!.getCatalog('QA'));
  expect(result).toMatchObject({
    ok: true,
    value: { entities: [{ code: 'TEST-E2E', revision: 1 }], audit: [{ action: 'CREATED' }] },
  });
  await window.getByLabel('Código de entidad').fill('TEST-CORREGIDO');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(
    window.getByRole('button', { name: 'Editar TEST-CORREGIDO', exact: true }),
  ).toBeVisible();
});

test('Escape no cierra una eliminación de catálogo pendiente y permite cancelar después del timeout', async () => {
  const window = await launch();
  await createTestEntity(window);
  await window.getByRole('button', { name: 'Eliminar TEST-E2E', exact: true }).click();
  const dialog = window.getByRole('dialog');
  const lock = new DatabaseSync(join(directory, 'catalogs.sqlite'));
  try {
    lock.exec('BEGIN IMMEDIATE');
    await dialog.getByRole('button', { name: 'Confirmar eliminación', exact: true }).click();
    await window.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toContainText('ocupado');
    lock.exec('ROLLBACK');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await window.getByRole('button', { name: 'Recargar', exact: true }).click();
    await expect(
      window.getByRole('button', { name: 'Editar TEST-E2E', exact: true }),
    ).toBeVisible();
  } finally {
    lock.close();
  }
});

test('pantalla del mockup: contexto ATM, catálogo CMS, monto y cambio de ambiente', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de preparación QA');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await expect(window.getByRole('heading', { name: 'Nueva transacción' })).toBeVisible();
  await expect(window.locator('.transaction-steps [aria-current="step"]')).toContainText(
    'Datos Generales',
  );
  const reference = window.locator('.documented-operation');
  await expect(reference.getByText('301000', { exact: true })).toBeVisible();
  await expect(reference).toContainText('Extreme Mediator CMS v3.6 · p. 20');
  await window.getByLabel('Cuenta', { exact: true }).selectOption('CURRENT');
  await expect(reference.getByText('302000', { exact: true })).toBeVisible();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de preparación QA · Borrador' });
  await expect(window.getByText('Perfil en borrador', { exact: true })).toBeVisible();
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByText('Envío bloqueado · QA')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
  await expect(window.getByRole('tab', { name: 'RAW', exact: true })).toBeDisabled();
  await expect(window.getByRole('tab', { name: 'HEX', exact: true })).toBeDisabled();
  await expect(window.getByText('Sin mensaje recibido', { exact: true })).toBeVisible();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await expect(window.getByText('Envío bloqueado · QA')).toHaveCount(0);
  await expect(reference.getByText('012000', { exact: true })).toBeVisible();
  await window.getByLabel('Monto de prueba').fill('100,50');
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByRole('alert')).toContainText('punto y dos decimales');
  await window.getByLabel('Monto de prueba').fill('100.50');
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByText('Envío bloqueado · QA')).toBeVisible();
  await expect(window.getByText('Reglas financieras del monto', { exact: true })).toBeVisible();
  await window.getByLabel('Cuenta', { exact: true }).selectOption('SAVINGS');
  await expect(reference.getByText('011000', { exact: true })).toBeVisible();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_DECLINED');
  await expect(reference.getByText('011000', { exact: true })).toBeVisible();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('');
  await mkdir('artifacts', { recursive: true });
  await window.evaluate(() => globalThis.window.scrollTo(0, 0));
  await window.screenshot({ path: 'artifacts/transaction-workspace.png' });
  await app?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1040, 760));
  await expect
    .poll(() =>
      window.evaluate(() => document.documentElement.scrollWidth <= globalThis.window.innerWidth),
    )
    .toBe(true);
  await window.screenshot({ path: 'artifacts/transaction-workspace-small.png' });
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue('BALANCE');
  await expect(window.getByLabel('Monto de prueba')).toHaveCount(0);
  await expect(window.getByText('Envío bloqueado · QA')).toHaveCount(0);
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toBeDisabled();
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByText('Envío bloqueado · PREPROD')).toBeVisible();
  await expect(window.locator('.transaction-empty-row')).toContainText('Aún no hay ejecuciones');
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await window.getByLabel('Transacción', { exact: true }).selectOption('TIMEOUT_REVERSAL');
  await expect(window.getByLabel('Cuenta', { exact: true })).toBeDisabled();
  await expect(reference.getByText('TrnCode CMS', { exact: true })).toHaveCount(0);
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(
    window.getByText('Transacción original y reglas de reverso', { exact: true }),
  ).toBeVisible();
  await expect(window.locator('.transaction-steps [aria-current="step"]')).toHaveCount(1);
});

test('preparación rechaza ATM editado y recupera el contexto al recargar', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM para concurrencia');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM para concurrencia · Borrador' });
  const changed = await window.evaluate(async () => {
    const api = globalThis.window.desktop!;
    const catalog = await api.getCatalog('QA');
    if (!catalog.ok) throw new Error('Catalog unavailable');
    const atm = catalog.value.atms[0]!;
    return api.saveAtm({
      environment: 'QA',
      id: atm.id,
      revision: atm.revision,
      values: {
        alias: 'ATM actualizado',
        entityId: atm.entityId,
        terminalId: atm.terminalId,
        acquirerId: atm.acquirerId,
        active: true,
      },
    });
  });
  expect(changed).toMatchObject({ ok: true });
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByRole('alert')).toContainText('El ATM cambió');
  await expect(window.getByText('Envío bloqueado · QA')).toHaveCount(0);
  await window.getByRole('button', { name: 'Recargar perfiles' }).click();
  await expect(window.getByRole('alert')).toHaveCount(0);
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM actualizado · Borrador' });
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByText('Envío bloqueado · QA')).toBeVisible();
});

test('plantillas documentales, resumen revisado y borrador conservado al navegar', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de plantillas');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de plantillas · Borrador' });
  await window.getByLabel('Escenario', { exact: true }).selectOption('RTC');
  await window.getByLabel('Plantilla documental').selectOption('WITHDRAWAL_APPROVED:CURRENT');
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue(
    'WITHDRAWAL_APPROVED',
  );
  await expect(window.getByLabel('Cuenta', { exact: true })).toHaveValue('CURRENT');
  await expect(window.getByLabel('Escenario', { exact: true })).toHaveValue('RTC');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).not.toHaveValue('');
  await expect(window.getByText('Reglas financieras del monto', { exact: true })).toBeVisible();
  await window.getByLabel('Monto de prueba').fill('100,50');
  await expect(window.getByLabel('Monto de prueba')).toHaveAttribute('aria-invalid', 'true');
  await expect(
    window.getByText('Usa punto y dos decimales, por ejemplo 100.50. No se modifica tu entrada.'),
  ).toBeVisible();
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(window.getByLabel('Monto de prueba')).toBeFocused();
  await window.getByLabel('Monto de prueba').fill('100.50');
  await expect(window.getByLabel('Monto de prueba')).toHaveAttribute('aria-invalid', 'false');
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  const summary = window.getByRole('region', { name: 'Contexto revisado' });
  await expect(summary).toContainText('012000');
  await expect(summary).toContainText('100.50');
  await expect(summary).toContainText('ATM de plantillas · versión 1 · borrador');
  await summary.getByText('Referencia de revisión').click();
  await expect(summary.locator('code')).toHaveText(/^[0-9a-f-]{36}$/);
  await window.getByRole('button', { name: 'Ver configuración pendiente', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await expect(summary).toBeVisible();
  await window.getByLabel('Monto de prueba').fill('120.00');
  await expect(summary).toHaveCount(0);
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(summary).toContainText('120.00');
  await summary.scrollIntoViewIfNeeded();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/transaction-review-summary.png' });
  await window.getByRole('button', { name: 'Limpiar borrador' }).click();
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue('BALANCE');
  await expect(window.getByLabel('Escenario', { exact: true })).toHaveValue('LOCAL');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(summary).toHaveCount(0);
  await window.getByLabel('Transacción', { exact: true }).selectOption('REVERSAL');
  await expect(
    window.getByText('Transacción original y reglas de reverso', { exact: true }),
  ).toBeVisible();
});

test('compatibilidad Mediator PREPROD desde evidencia del esquema, sin conexión simulada ni truncado', async () => {
  const window = await launch();
  await createTestEntity(window);
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await createTestAtm(window, 'ATM para Mediator');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM para Mediator · Borrador' });
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  const compatibility = window.getByRole('region', { name: 'Compatibilidad del destino' });
  await expect(compatibility).toContainText('Esquema Mediator PREPROD');
  await expect(compatibility).toContainText('Terminal ID · Incompatible');
  await expect(compatibility).toContainText('13 bytes ASCII; Mediator admite 10. No se trunca.');
  await expect(compatibility).toContainText('Entidad, canal y terminal · Pendiente');
  await expect(window.getByRole('button', { name: 'Enviar transacción' })).toBeDisabled();
  await compatibility.scrollIntoViewIfNeeded();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/mediator-compatibility.png' });
  await window.getByRole('button', { name: 'Perfiles ATM', exact: true }).click();
  await window.getByRole('button', { name: 'Editar ATM para Mediator', exact: true }).click();
  await expect(window.getByLabel('Terminal ID', { exact: true })).toHaveValue('Test-Terminal');
  await window.getByLabel('Terminal ID', { exact: true }).fill('TESTTERM');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await expect(compatibility).toHaveCount(0);
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(compatibility).toContainText('Terminal ID · Longitud compatible');
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await window.getByRole('button', { name: 'Revisar requisitos' }).click();
  await expect(compatibility).toHaveCount(0);
});

test('CRUD de entidades y ATM, separación de ambientes, reinicio y eliminación protegida', async () => {
  test.setTimeout(60_000);
  let window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM sintético QA');
  await window.getByRole('button', { name: 'Editar ATM sintético QA', exact: true }).click();
  await window.getByLabel('Alias ATM').fill('ATM QA editado');
  await window.getByLabel('Perfil ATM activo').uncheck();
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('cell', { name: 'Inactivo', exact: true })).toBeVisible();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(window.getByText('Aún no hay perfiles ATM en este ambiente')).toBeVisible();
  await createTestAtm(window, 'ATM sintético PREPROD');
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await expect(
    window.getByRole('button', { name: 'Editar ATM QA editado', exact: true }),
  ).toBeVisible();
  await app?.close();
  app = undefined;
  window = await launch();
  await window.getByRole('button', { name: 'Perfiles ATM', exact: true }).click();
  await expect(
    window.getByRole('button', { name: 'Editar ATM QA editado', exact: true }),
  ).toBeVisible();
  const catalog = await window.evaluate(() => globalThis.window.desktop?.getCatalog('QA'));
  expect(catalog).toMatchObject({
    ok: true,
    value: { atms: [{ alias: 'ATM QA editado', revision: 2, active: false, status: 'DRAFT' }] },
  });
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/atm-catalog.png', fullPage: true });
  await window.getByRole('button', { name: 'Eliminar ATM QA editado', exact: true }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(
    window.getByRole('button', { name: 'Editar ATM QA editado', exact: true }),
  ).toHaveCount(0);
  await window.getByRole('button', { name: 'Entidades', exact: true }).click();
  await window.getByRole('button', { name: 'Eliminar TEST-E2E', exact: true }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(window.getByRole('dialog').getByRole('alert')).toContainText(
    'perfiles ATM asociados',
  );
  await window.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await window.getByRole('button', { name: 'Perfiles ATM', exact: true }).click();
  await window.getByRole('button', { name: 'Eliminar ATM sintético PREPROD', exact: true }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(window.getByText('Aún no hay perfiles ATM en este ambiente')).toBeVisible();
  await window.getByRole('button', { name: 'Entidades', exact: true }).click();
  await window.getByRole('button', { name: 'Eliminar TEST-E2E', exact: true }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(window.getByText('Crea tu primera entidad de prueba')).toBeVisible();
});

test('una edición concurrente se conserva y los contratos rechazan producción/datos sensibles', async () => {
  const window = await launch();
  await createTestEntity(window);
  await window.getByRole('button', { name: 'Editar TEST-E2E', exact: true }).click();
  const result = await window.evaluate(async () => {
    const api = globalThis.window.desktop;
    if (!api) throw new Error('Service unavailable');
    const catalog = await api.getCatalog('QA');
    if (!catalog.ok || !catalog.value.entities[0]) throw new Error('Catalog unavailable');
    const entity = catalog.value.entities[0];
    const saved = await api.saveEntity({
      environment: 'QA',
      id: entity.id,
      revision: entity.revision,
      values: {
        code: entity.code,
        name: 'Cambio concurrente E2E',
        networkType: entity.networkType,
        active: entity.active,
      },
    });
    const production = await api.getCatalog('PROD' as Environment);
    const sensitive = await api.saveEntity({
      environment: 'QA',
      id: null,
      revision: null,
      values: { code: 'SENSITIVE', name: '0'.repeat(16), networkType: 'COONECTA', active: true },
    });
    return { saved, production, sensitive };
  });
  expect(result.saved).toMatchObject({ ok: true });
  expect(result.production).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  expect(result.sensitive).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  await window.getByLabel('Nombre de entidad').fill('Edición obsoleta');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('alert')).toContainText('El registro cambió');
  await expect(window.getByRole('button', { name: 'Guardar borrador' })).toBeDisabled();
  await window.getByRole('button', { name: 'Recargar', exact: true }).click();
  await expect(
    window.getByRole('cell', { name: 'Cambio concurrente E2E', exact: true }),
  ).toBeVisible();
  await expect(window.getByText('Edición obsoleta', { exact: true })).toHaveCount(0);
});

test('SQLite corrupto bloquea el catálogo pero permite el shell y conserva el archivo', async () => {
  const file = join(directory, 'catalogs.sqlite');
  await writeFile(file, 'private-secret');
  const window = await launch();
  await window.getByRole('button', { name: 'Entidades', exact: true }).click();
  await expect(window.getByRole('alert')).toContainText('No se pudo abrir el catálogo local');
  await expect(window.getByRole('button', { name: 'Nueva entidad' })).toBeDisabled();
  await expect(window.getByText('private-secret')).toHaveCount(0);
  expect(await window.evaluate(() => globalThis.window.desktop?.getSnapshot())).toMatchObject({
    ok: true,
  });
  expect(await readFile(file, 'utf8')).toBe('private-secret');
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

test('el lanzador dev muestra la ventana nativa de Electron en Windows', async () => {
  test.skip(process.platform !== 'win32', 'Regresion de SW_HIDE en Windows.');
  const launcher = spawn(
    process.execPath,
    [resolve('tooling/dev.mjs'), `--user-data-dir=${directory}`],
    { cwd: resolve('.'), stdio: 'ignore', windowsHide: true },
  );
  if (!launcher.pid) throw Error('El lanzador no inicio.');
  const launcherPid = launcher.pid;
  const exited = new Promise<void>((done) => launcher.once('exit', () => done()));
  const run = promisify(execFile);
  const powershell = join(
    process.env.SystemRoot ?? 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  let electronPid: number | undefined;
  try {
    await expect
      .poll(
        async () => {
          const { stdout } = await run(
            powershell,
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Get-CimInstance Win32_Process -Filter "Name='electron.exe' AND ParentProcessId=${launcherPid}" | ForEach-Object { $p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; [pscustomobject]@{id=$_.ProcessId;visible=($p.MainWindowHandle -ne 0);title=$p.MainWindowTitle} } | ConvertTo-Json -Compress`,
            ],
            { windowsHide: true, timeout: 5000 },
          );
          if (!stdout.trim()) return false;
          const state = JSON.parse(stdout) as { id: number; visible: boolean; title: string };
          electronPid = state.id;
          return state.visible && state.title.includes('ATM Transaction Simulator');
        },
        { timeout: 15000, intervals: [250, 500] },
      )
      .toBe(true);
    const response = await fetch('http://127.0.0.1:5173/', {
      signal: AbortSignal.timeout(3000),
    });
    expect(response.status).toBe(200);
  } finally {
    if (electronPid && launcher.exitCode === null)
      await run(
        powershell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "Name='electron.exe' AND ProcessId=${electronPid} AND ParentProcessId=${launcherPid}" | ForEach-Object { Stop-Process -Id $_.ProcessId }`,
        ],
        { windowsHide: true, timeout: 5000 },
      );
    if (launcher.exitCode === null) await exited;
  }
});
