import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchTestDesktop } from '../helpers/electron-launch';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { capturedBalanceRequest } from '../helpers/captured-visa-balance';
import { balanceResponse } from '../helpers/balance-inquiry';

let directory: string;
let app: ElectronApplication | undefined;
let window: Page;
function fixtures() {
  const codec = new CapturedVisaBalance();
  const body = capturedBalanceRequest();
  const reference = approvedWithdrawalExecution();
  const current = approvedWithdrawalExecution();
  delete reference.withdrawal;
  delete current.withdrawal;
  reference.correlation!.stan = '000124';
  current.outcome = 'NOT_APPROVED';
  current.responseCode = '96';
  current.elapsedMs = 650;
  const referenceResponse = balanceResponse(codec.inspect(body));
  const currentResponse = balanceResponse(codec.inspect(body), '96');
  reference.messages = { request: codec.message(body), response: codec.message(referenceResponse) };
  current.messages = { request: codec.message(body), response: codec.message(currentResponse) };
  const referenceFull = {
    requestId: reference.requestId,
    expiresAt: null,
    messages: {
      '0200': codec.sessionMessage(body),
      '0210': codec.sessionMessage(referenceResponse),
    },
  };
  const currentFull = {
    requestId: current.requestId,
    expiresAt: null,
    messages: { '0200': codec.sessionMessage(body), '0210': codec.sessionMessage(currentResponse) },
  };
  for (const message of [
    reference.messages.request,
    reference.messages.response!,
    ...Object.values(referenceFull.messages),
  ]) {
    message.fields.find((field) => field.number === 11)!.value = '000124';
  }
  for (const message of [
    current.messages.request,
    current.messages.response!,
    ...Object.values(currentFull.messages),
  ]) {
    message.fields.find((field) => field.number === 11)!.value = current.correlation!.stan;
  }
  return { reference, current, referenceFull, currentFull };
}
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-comparison-'));
  app = await launchTestDesktop(directory);
  window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
});
test.afterEach(async () => {
  await app?.close();
  app = undefined;
  await removeTestDirectory(directory, 'coonecta-comparison-');
});
async function openComparison() {
  await window
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Reportería y auditoría', exact: true })
    .click();
  await window.getByRole('tab', { name: 'Reportes', exact: true }).click();
  await window
    .getByRole('navigation', { name: 'Tipo de reporte' })
    .getByRole('button', { name: 'Transacciones', exact: true })
    .click();
  await window.getByRole('button', { name: 'Abrir operación 000123', exact: true }).click();
  await window.getByRole('tab', { name: 'Mensajes', exact: true }).click();
  return window.getByRole('region', { name: 'Comparador de transacciones', exact: true });
}
test('compara dos operaciones, filtra y retira los valores completos al ocultar Mensajes', async () => {
  const data = fixtures();
  await app!.evaluate(({ ipcMain }, data) => {
    ipcMain.removeHandler('transaction:balance:history');
    ipcMain.handle('transaction:balance:history', () => ({
      ok: true,
      value: [data.reference, data.current],
    }));
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', (_event, request) => ({
      ok: true,
      value: request.requestId === data.reference.requestId ? data.referenceFull : data.currentFull,
    }));
  }, data);
  const comparison = await openComparison();
  const select = comparison.getByLabel('Operación de referencia');
  await expect(select.locator('option')).toHaveCount(2);
  const referenceSearch = comparison.getByRole('searchbox', {
    name: 'Buscar referencia',
    exact: true,
  });
  await referenceSearch.fill('inexistente');
  await expect(select.locator('option')).toHaveCount(1);
  await expect(comparison).toContainText('Sin coincidencias');
  await referenceSearch.fill(data.reference.requestId);
  await expect(select.locator('option')).toHaveCount(2);
  await select.selectOption(data.reference.requestId);
  await referenceSearch.fill('inexistente');
  await expect(select).toHaveValue(data.reference.requestId);
  await expect(comparison).toContainText('Se conserva la referencia seleccionada');
  await referenceSearch.fill('000124');
  await expect(comparison).toContainText('Referencia: valores completos disponibles.');
  await expect(comparison).toContainText('referencia 250 ms · actual 650 ms');
  const response = comparison.getByRole('table', { name: 'Diferencias de respuesta', exact: true });
  const code = response.getByRole('row').filter({ hasText: 'F39 · Código de respuesta' });
  await expect(code).toContainText('00');
  await expect(code).toContainText('96');
  await expect(code).toContainText('Diferente');
  const responseSummary = comparison.getByLabel('Resumen de respuesta', { exact: true });
  await expect(responseSummary).toContainText('2 diferentes');
  const summaryBefore = await responseSummary.textContent();
  const fieldSearch = comparison.getByRole('searchbox', {
    name: 'Buscar campo o tag',
    exact: true,
  });
  await fieldSearch.fill('CODIGO DE RESPUESTA');
  await expect(response.getByRole('row')).toHaveCount(2);
  await expect(responseSummary).toContainText('2 diferentes');
  await expect(responseSummary).toContainText('Mostrando 1 de');
  await fieldSearch.fill('inexistente');
  await expect(response).toHaveCount(0);
  await expect(
    comparison.getByText('No hay filas que coincidan con los filtros.', { exact: false }),
  ).toHaveCount(2);
  await fieldSearch.fill('');
  await expect(responseSummary).toHaveText(summaryBefore!);
  await expect(response.getByRole('row').filter({ hasText: 'F11 · STAN' })).toContainText(
    'Identificador variable',
  );
  await expect(response.getByRole('row').filter({ hasText: 'MTI' })).toHaveCount(0);
  await comparison
    .getByRole('checkbox', { name: 'Solo diferencias y valores no verificables' })
    .uncheck();
  await expect(response.getByRole('row').filter({ hasText: 'MTI' })).toContainText('Igual');
  const request = comparison.getByRole('table', { name: 'Diferencias de solicitud', exact: true });
  await expect(request.getByRole('row').filter({ hasText: 'F52 · PIN Block' })).toContainText(
    'HEX',
  );
  await window.getByRole('checkbox', { name: 'Mostrar valores completos' }).uncheck();
  await expect(request.getByRole('row').filter({ hasText: 'F52 · PIN Block' })).toContainText(
    'No verificable',
  );
  expect(
    await comparison.evaluate((element) =>
      element.textContent!.includes('411111' + '0'.repeat(10)),
    ),
  ).toBe(false);
  await window.getByRole('checkbox', { name: 'Mostrar valores completos' }).check();
  await expect(comparison).toContainText('Referencia: valores completos disponibles.');
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 768),
  );
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await mkdir('artifacts', { recursive: true });
  await comparison
    .getByRole('checkbox', { name: 'Solo diferencias y valores no verificables' })
    .check();
  await comparison.screenshot({ path: 'artifacts/transaction-comparison.png' });
  await window.getByRole('tab', { name: 'Flujo', exact: true }).click();
  await expect(comparison).toHaveCount(0);
  expect(
    await window.evaluate(() => document.body.textContent!.includes('411111' + '0'.repeat(10))),
  ).toBe(false);
  await window.getByRole('tab', { name: 'Mensajes', exact: true }).click();
  await expect(select).toHaveValue('');
  await select.selectOption(data.reference.requestId);
  await select.selectOption('');
  await expect(comparison.getByRole('table')).toHaveCount(0);
});

test('referencia: consulta fallida, timeout y reintento sin inventar respuesta ausente', async () => {
  const data = fixtures();
  delete data.reference.messages!.response;
  data.reference.responseCode = null;
  data.reference.outcome = 'RESPONSE_TIMEOUT';
  await app!.evaluate(({ ipcMain }, data) => {
    ipcMain.removeHandler('transaction:balance:history');
    ipcMain.handle('transaction:balance:history', () => ({
      ok: true,
      value: [data.reference, data.current],
    }));
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', () => ({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Archivo de prueba no disponible',
      },
    }));
  }, data);
  const comparison = await openComparison();
  await comparison.getByLabel('Operación de referencia').selectOption(data.reference.requestId);
  await expect(comparison).toContainText('Archivo de prueba no disponible');
  await expect(comparison).toContainText('Mensaje no disponible en la referencia');
  const code = comparison
    .getByRole('table', { name: 'Diferencias de respuesta', exact: true })
    .getByRole('row')
    .filter({ hasText: 'F39 · Código de respuesta' });
  await expect(code).toContainText('No verificable');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', () => new Promise(() => {}));
  });
  await comparison.getByRole('button', { name: 'Actualizar referencia' }).click();
  await expect(comparison).toContainText('Consultando mensajes de referencia');
  // Renderer and isolated preload have separate clocks; exercise their real deadlines together.
  await expect(comparison).toContainText('El servicio local no respondió a tiempo', {
    timeout: 7000,
  });
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', () => ({ ok: true, value: null }));
  });
  await comparison.getByRole('button', { name: 'Actualizar referencia' }).click();
  await expect(comparison).toContainText('Referencia: original completo no disponible');
  await expect(comparison).not.toContainText('El servicio local no respondió a tiempo');
});
