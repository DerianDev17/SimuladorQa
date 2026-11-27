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
  await window.getByRole('button', { name: 'Comparar transacciones', exact: true }).click();
  return window.getByRole('region', { name: 'Comparador de transacciones', exact: true });
}

async function seed(data: ReturnType<typeof fixtures>) {
  await app!.evaluate(({ ipcMain }, data) => {
    ipcMain.removeHandler('transaction:balance:history');
    ipcMain.handle('transaction:balance:history', () => ({
      ok: true,
      value: [data.reference, data.current],
    }));
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', (_event, request) => ({
      ok: true,
      value:
        request.requestId === data.reference.requestId
          ? data.referenceFull
          : request.requestId === data.current.requestId
            ? data.currentFull
            : null,
    }));
  }, data);
}
async function chooseReference(comparison: ReturnType<Page['getByRole']>) {
  await comparison.getByRole('button', { name: 'Elegir transacción A', exact: true }).click();
  await comparison.getByRole('button', { name: 'Usar en A STAN 000124', exact: true }).click();
  await expect(
    comparison.getByRole('region', { name: 'Transacción A', exact: true }),
  ).toContainText('000124');
}

test('selección A/B, tabla completa, diferencias por caracteres, intercambio y privacidad', async () => {
  await seed(fixtures());
  const comparison = await openComparison();
  await comparison
    .getByText('Cómo elegir las transacciones y leer las diferencias', { exact: true })
    .click();
  await expect(comparison).toContainText('A y B deben ser distintas');
  await comparison
    .getByText('Cómo elegir las transacciones y leer las diferencias', { exact: true })
    .click();
  await comparison.getByRole('button', { name: 'Elegir transacción A', exact: true }).click();
  await comparison
    .getByRole('searchbox', { name: 'Buscar transacción', exact: true })
    .fill('inexistente');
  await expect(comparison).toContainText('No hay coincidencias en Recientes');
  await comparison
    .getByRole('searchbox', { name: 'Buscar transacción', exact: true })
    .fill('000124');
  await expect(
    comparison.getByRole('button', { name: 'Usar en A STAN 000123', exact: true }),
  ).toHaveCount(0);
  await comparison.getByRole('button', { name: 'Usar en A STAN 000124', exact: true }).click();
  await expect(comparison).toContainText('A: Valores completos disponibles.');
  const request = comparison.getByRole('table', { name: 'Diferencias de solicitud', exact: true });
  await expect(request.getByRole('row').filter({ hasText: 'MTI' })).toContainText('Igual');
  await expect(request.getByRole('row').filter({ hasText: 'PIN Block' })).toContainText('HEX');
  await comparison.getByRole('tab', { name: /^Respuesta\s/ }).click();
  const response = comparison.getByRole('table', { name: 'Diferencias de respuesta', exact: true });
  const code = response.getByRole('row').filter({ hasText: 'Código de respuesta' });
  await expect(code.locator('mark.diff-A')).toHaveText('00');
  await expect(code.locator('mark.diff-B')).toHaveText('96');
  await comparison
    .getByRole('searchbox', { name: 'Buscar campo o tag' })
    .fill('CODIGO DE RESPUESTA');
  await expect(response.getByRole('row')).toHaveCount(2);
  await comparison.getByRole('button', { name: 'Siguiente diferencia' }).click();
  await expect(code).toBeFocused();
  await expect(comparison).toContainText('Diferencia 1 de 1');
  await comparison.getByRole('searchbox', { name: 'Buscar campo o tag' }).fill('sin coincidencias');
  await expect(response).toHaveCount(0);
  await comparison.getByRole('searchbox', { name: 'Buscar campo o tag' }).fill('');
  await comparison
    .getByRole('checkbox', { name: 'Solo diferencias y valores no verificables' })
    .check();
  await expect(response.getByRole('row').filter({ hasText: 'MTI' })).toHaveCount(0);
  await window.getByRole('checkbox', { name: 'Mostrar valores completos' }).uncheck();
  await comparison.getByRole('tab', { name: /^Solicitud\s/ }).click();
  await expect(request.getByRole('row').filter({ hasText: 'PIN Block' })).toContainText(
    'No verificable',
  );
  expect(
    await comparison.evaluate((element) =>
      element.textContent!.includes('411111' + '0'.repeat(10)),
    ),
  ).toBe(false);
  await window.getByRole('checkbox', { name: 'Mostrar valores completos' }).check();
  await expect(comparison).toContainText('A: Valores completos disponibles.');
  await comparison.getByRole('button', { name: 'Intercambiar A y B' }).click();
  await expect(
    comparison.getByRole('region', { name: 'Transacción A', exact: true }),
  ).toContainText('000123');
  await expect(
    comparison.getByRole('region', { name: 'Transacción B', exact: true }),
  ).toContainText('000124');
  await expect(comparison).toContainText('B: Valores completos disponibles.');
  await comparison.getByRole('tab', { name: /^Respuesta\s/ }).click();
  await expect(code.locator('mark.diff-A')).toHaveText('96');
  await expect(code.locator('mark.diff-B')).toHaveText('00');
  await comparison
    .getByRole('checkbox', { name: 'Solo diferencias y valores no verificables' })
    .check();
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setContentSize(1024, 768),
  );
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({
    path: 'artifacts/transaction-comparison-redesign.png',
    fullPage: true,
  });
  await window.getByRole('tab', { name: 'Flujo', exact: true }).click();
  await expect(comparison).toHaveCount(0);
  expect(
    await window.evaluate(() => document.body.textContent!.includes('411111' + '0'.repeat(10))),
  ).toBe(false);
  await window
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('button', { name: 'Ayuda interna', exact: true })
    .click();
  await expect(window.getByRole('heading', { name: 'Ayuda interna', exact: true })).toBeVisible();
  await expect(window.getByRole('article', { name: 'Contenido de ayuda' })).toContainText(
    'Elige A, la referencia',
  );
  await expect(
    window.getByRole('article', { name: 'Contenido de ayuda' }).getByRole('link'),
  ).toHaveCount(0);
  await window.getByRole('searchbox', { name: 'Buscar en la ayuda' }).fill('cifrado');
  await expect(window.getByRole('article', { name: 'Contenido de ayuda' })).toContainText(
    'archivo cifrado local',
  );
  await expect(window.getByRole('article', { name: 'Contenido de ayuda' })).not.toContainText(
    'Elige A, la referencia',
  );
  await expect(
    window.getByRole('button', { name: 'Historial y mensajes', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await window.getByRole('button', { name: 'Historial y mensajes', exact: true }).click();
  await expect(window.getByRole('article', { name: 'Contenido de ayuda' })).toContainText(
    'archivo cifrado local',
  );
  await window.getByRole('searchbox', { name: 'Buscar en la ayuda' }).fill('sin coincidencias');
  await expect(
    window.getByRole('article', { name: 'Contenido de ayuda' }).getByRole('status'),
  ).toContainText('Prueba con otro término');
  await expect(window.getByRole('article', { name: 'Contenido de ayuda' })).not.toContainText(
    'archivo cifrado local',
  );
  await expect(
    window.getByRole('navigation', { name: 'Temas de ayuda' }).getByRole('button'),
  ).toHaveCount(0);
  await window.getByRole('searchbox', { name: 'Buscar en la ayuda' }).fill('');
  await expect(
    window.getByRole('button', { name: 'Historial y mensajes', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  await expect(window.getByRole('article', { name: 'Contenido de ayuda' })).toContainText(
    'archivo cifrado local',
  );
});

test('selecciona B desde todo el historial, rechaza A duplicada y conserva la pareja al cancelar', async () => {
  const data = fixtures();
  await seed(data);
  const archived = {
    ...data.current,
    requestId: approvedWithdrawalExecution().requestId,
    correlation: { ...data.current.correlation!, stan: '000125' },
  };
  await app!.evaluate(
    ({ ipcMain }, data) => {
      ipcMain.removeHandler('transaction:history:page');
      ipcMain.handle('transaction:history:page', () => ({
        ok: true,
        value: { entries: [data.reference, data.archived], next: null },
      }));
    },
    { reference: data.reference, archived },
  );
  const comparison = await openComparison();
  await chooseReference(comparison);
  await comparison.getByRole('button', { name: 'Cambiar transacción B' }).click();
  await comparison.getByRole('button', { name: 'Todo el historial', exact: true }).click();
  await comparison
    .getByRole('button', { name: 'Abrir operación histórica 000124', exact: true })
    .click();
  await expect(comparison.getByRole('alert')).toContainText('A y B deben ser distintas');
  await comparison
    .getByRole('button', { name: 'Abrir operación histórica 000125', exact: true })
    .click();
  await expect(
    comparison.getByRole('region', { name: 'Transacción B', exact: true }),
  ).toContainText('000125');
  await expect(comparison).toContainText('B: Original completo no disponible');
  await comparison.getByRole('button', { name: 'Cambiar transacción A' }).click();
  await comparison.getByRole('button', { name: 'Cancelar selección' }).click();
  await expect(
    comparison.getByRole('region', { name: 'Transacción A', exact: true }),
  ).toContainText('000124');
  await expect(comparison.getByRole('button', { name: 'Cambiar transacción A' })).toBeFocused();
});

test('referencia: error, timeout y recuperación sin inventar mensajes ausentes', async () => {
  const data = fixtures();
  delete data.reference.messages!.request.fields.find((field) => field.number === 55)!.tags;
  data.current.messages!.request.fields.find((field) => field.number === 55)!.tags = [
    { tag: '95', value: '0000000000' },
  ];
  delete data.reference.messages!.response;
  data.reference.responseCode = null;
  data.reference.outcome = 'RESPONSE_TIMEOUT';
  await seed(data);
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', () => ({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Archivo de prueba no disponible' },
    }));
  });
  const comparison = await openComparison();
  await chooseReference(comparison);
  await expect(comparison).toContainText('Archivo de prueba no disponible');
  const tagRow = comparison.getByRole('row').filter({ hasText: 'F55/95' });
  await expect(tagRow).toHaveAttribute('data-comparison', 'unverifiable');
  await expect(tagRow).toContainText('desglose no disponible');
  await comparison.getByRole('tab', { name: /^Respuesta\s/ }).click();
  await expect(comparison).toContainText('Mensaje no disponible en A');
  await expect(
    comparison.getByRole('row').filter({ hasText: 'Código de respuesta' }),
  ).toContainText('No verificable');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', () => new Promise(() => {}));
  });
  await comparison.getByRole('button', { name: 'Actualizar referencia' }).click();
  await expect(comparison).toContainText('Consultando mensajes');
  await expect(comparison).toContainText('El servicio local no respondió a tiempo', {
    timeout: 7000,
  });
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('transaction:messages:session');
    ipcMain.handle('transaction:messages:session', () => ({ ok: true, value: null }));
  });
  await comparison.getByRole('button', { name: 'Actualizar referencia' }).click();
  await expect(comparison).toContainText('A: Original completo no disponible');
  await expect(comparison).not.toContainText('El servicio local no respondió a tiempo');
});
