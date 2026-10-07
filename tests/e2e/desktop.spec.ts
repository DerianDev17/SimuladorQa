import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import type { Environment } from '../../packages/domain/src/index';
import { createServer } from 'vite';
import { removeTestDirectory } from '../helpers/temporary-directory';

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

test('composición del mockup: tres paneles y resumen dentro de la ventana desktop', async () => {
  const window = await launch();
  await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1536, 1024),
  );
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
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
