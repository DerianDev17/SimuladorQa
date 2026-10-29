import { _electron as electron, expect, test } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import type { Environment } from '../../packages/domain/src/index';
import type {
  CardIdentityReading,
  CardReaderSnapshot,
} from '../../packages/domain/src/card-reader';
import type { Result } from '../../packages/shared/src/contracts';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import type { LoadRunRequest, LoadRunSnapshot } from '../../packages/domain/src/load-run';
import { createServer } from 'vite';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { networkEvidence } from '../helpers/network-evidence';
import { decodeResponse } from '../../apps/desktop/src/main/adapters/mediator-observer';
import { observationBatch } from '../helpers/observations';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { build } from 'esbuild';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import { qaExecutionFixture } from '../helpers/qa-execution';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import { capturedBalanceRequest } from '../helpers/captured-visa-balance';
import { balanceResponse } from '../helpers/balance-inquiry';
import { NewVisaWithdrawal } from '../../apps/desktop/src/main/adapters/new-visa-withdrawal';
import { QaVisaReversal } from '../../apps/desktop/src/main/adapters/qa-visa-reversal';
import { reversalFixture, reversalResponse } from '../helpers/withdrawal-reversal';
import { withdrawalResponse } from '../helpers/withdrawal';

let directory: string;
let app: ElectronApplication | undefined;

test('formulario compacto: tarjeta física, perfil configurado y opciones', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1366, 960),
  );
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await expect(send).toBeDisabled();
  await expect(picker.getByRole('button', { name: 'Lector físico', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(picker.getByLabel('Perfil QA guardado para la transacción')).toHaveCount(0);
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await expect(picker.getByRole('status')).toContainText(transactionIdentity.panMasked!);
  await expect(picker.getByRole('status')).toContainText('No informada');
  const order = await window.evaluate(() => {
    const selectors = [
      '.transaction-context-selectors',
      '.transaction-card-section',
      'select[aria-label="Transacción"]',
      'select[aria-label="Cuenta"]',
      '.composer-footer',
    ];
    const positions = selectors.map(
      (selector) => document.querySelector(selector)!.getBoundingClientRect().top,
    );
    return positions.every((top, index) => index === 0 || top > positions[index - 1]!);
  });
  expect(order).toBe(true);
  await mkdir('artifacts', { recursive: true });
  await window
    .locator('.transaction-composer')
    .screenshot({ path: 'artifacts/transaction-composer.png' });
  await picker.getByRole('button', { name: 'Tarjeta configurada', exact: true }).click();
  await expect(send).toBeDisabled();
  await expect(picker).toContainText('Guarda primero una lectura');
  await window.getByRole('button', { name: 'Opciones y detalles técnicos', exact: true }).click();
  await expect(window.getByLabel('Escenario', { exact: true })).toBeVisible();
  await expect(
    window.getByRole('button', { name: 'Administrar perfiles', exact: true }),
  ).toBeVisible();
  await window.getByRole('button', { name: 'Opciones y detalles técnicos', exact: true }).click();
  await expect(window.getByLabel('Escenario', { exact: true })).not.toBeVisible();
  await window.getByRole('button', { name: 'Inicio', exact: true }).click();
  const card = { ...transactionIdentity, applicationId: 'A0000000031010', expiry: '09/29' };
  await installTransactionReader(false, transactionIdentity.readId, card);
  await app!.evaluate(({ ipcMain }, identity) => {
    ipcMain.removeHandler('reader:profiles:list');
    ipcMain.handle('reader:profiles:list', () => ({
      ok: true,
      value: [
        {
          id: '351536a3-5a14-4371-99ba-65068a968962',
          alias: 'Tarjeta de prueba',
          lastFour: '4444',
          applicationId: identity.applicationId,
          applicationLabel: identity.applicationLabel,
          transactionDataRequirements: null,
          defaultAccount: 'SAVINGS',
          savedAt: identity.readAt,
          scope: 'QA_REFERENCE_ONLY',
        },
      ],
    }));
  }, card);
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await picker.getByRole('button', { name: 'Tarjeta configurada', exact: true }).click();
  await picker
    .getByLabel('Perfil QA guardado para la transacción')
    .selectOption('351536a3-5a14-4371-99ba-65068a968962');
  await expect(picker).toContainText('Requiere la tarjeta física');
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await expect(picker.getByRole('status')).toContainText('09/29');
  await picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true }).click();
  await installTransactionReader(true);
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('alert')).toContainText('agotó el tiempo');
  await expect(send).toBeDisabled();
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(700, 900),
  );
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test('mensajería ISO junto al resultado: campos reales, pestañas y pantalla estrecha', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  const codec = new CapturedVisaBalance();
  const body = capturedBalanceRequest();
  const metadata = codec.inspect(body);
  const sample = approvedWithdrawalExecution();
  delete sample.withdrawal;
  sample.correlation = { stan: metadata.stan, rrn: metadata.rrn, terminalId: metadata.terminalId };
  sample.messages = {
    request: codec.message(body),
    response: codec.message(balanceResponse(metadata)),
  };
  await app!.evaluate(({ ipcMain, BrowserWindow }, execution) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1536, 1024);
    ipcMain.removeHandler('transaction:balance:execute');
    ipcMain.handle('transaction:balance:execute', (_event, request) => ({
      ok: true,
      value: {
        ...execution,
        requestId: request.requestId,
        atmId: request.draft.atmId,
        cardReadId: request.cardReadId,
      },
    }));
  }, sample);
  await window
    .getByLabel('Elegir tarjeta', { exact: true })
    .getByRole('button', { name: 'Leer tarjeta', exact: true })
    .click();
  await window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }).click();
  await expect(window.getByLabel('Resultado de consulta de saldo', { exact: true })).toContainText(
    'Consulta aprobada',
  );
  const inspector = window.getByRole('region', {
    name: 'Mensajería de la transacción',
    exact: true,
  });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole('tab', { name: 'Respuesta (0210)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(inspector.getByRole('row').filter({ hasText: 'Código de respuesta' })).toContainText(
    '00',
  );
  await inspector.getByRole('tab', { name: 'Solicitud (0200)' }).click();
  await expect(inspector.locator('tbody tr')).toHaveCount(
    sample.messages.request.fields.length + 1,
  );
  await expect(inspector.getByRole('row').filter({ hasText: 'PIN Block' })).toContainText(
    '••••••••',
  );
  await expect(inspector).toContainText('411111XXXXXX0000');
  await expect(inspector).not.toContainText('411111' + '11110000');
  await inspector.getByRole('tab', { name: 'Solicitud (0200)' }).press('ArrowRight');
  await expect(inspector.getByRole('tab', { name: 'Respuesta (0210)' })).toBeFocused();
  const alignment = await window.evaluate(() => {
    const result = document.querySelector('.transaction-result-panel')!.getBoundingClientRect();
    const message = document.querySelector('.live-message-inspector')!.getBoundingClientRect();
    return {
      sideBySide: result.right <= message.left,
      aligned: result.top === message.top,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  expect(alignment).toEqual({ sideBySide: true, aligned: true, overflow: false });
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/transaction-messages-desktop.png', fullPage: true });
  await inspector
    .getByRole('button', { name: 'Ver todos los campos sin desplazamiento interno' })
    .click();
  await expect(inspector.getByRole('button', { name: 'Compactar tabla' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await inspector.getByRole('button', { name: 'Compactar tabla' }).click();
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1366, 768),
  );
  await window.evaluate(() => globalThis.window.scrollTo(0, 0));
  expect(
    await window.evaluate(() => {
      const result = document.querySelector('.transaction-result-panel')!.getBoundingClientRect();
      const message = document.querySelector('.live-message-inspector')!.getBoundingClientRect();
      return (
        result.width >= 280 &&
        message.width >= 380 &&
        document.documentElement.scrollWidth <= innerWidth
      );
    }),
  ).toBe(true);
  await window.screenshot({ path: 'artifacts/transaction-messages-1366.png', fullPage: true });
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1024, 768),
  );
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await window.screenshot({ path: 'artifacts/transaction-messages-narrow.png', fullPage: true });
});

test('carga de saldo: iniciar, medir, recuperar y detener con motor real y fuente sintética', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  await mkdir('artifacts', { recursive: true });
  await build({
    entryPoints: ['tests/helpers/load-electron.ts'],
    outfile: 'artifacts/load-electron.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  const sample = approvedWithdrawalExecution();
  delete sample.withdrawal;
  await app!.evaluate(
    ({ ipcMain, BrowserWindow }, options) => {
      const require = process.getBuiltinModule('module').createRequire(options.fixture);
      require(options.fixture).install(ipcMain, options.file, options.worker, options.sample);
      BrowserWindow.getAllWindows()[0]?.setContentSize(1366, 900);
    },
    {
      fixture: resolve('artifacts/load-electron.cjs'),
      file: join(directory, 'load-ui.sqlite'),
      worker: resolve('dist/load-worker.cjs'),
      sample,
    },
  );
  await window.getByRole('button', { name: 'Carga y estrés', exact: true }).click();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await window.getByRole('button', { name: '3 TPS', exact: false }).click();
  const start = window.getByRole('button', { name: 'Iniciar prueba', exact: true });
  await expect(start).toBeEnabled();
  await expect(start).toBeInViewport();
  await window.screenshot({ path: 'artifacts/load-assistant-basic.png' });
  await window.getByRole('button', { name: 'Modo avanzado', exact: false }).click();
  await window.getByLabel('Máximo de operaciones').fill('150');
  await expect(start).toBeDisabled();
  await expect(window.locator('.load-validation')).toContainText('entre 1 y 100');
  await window.getByLabel('Máximo de operaciones').fill('3');
  await expect(window.locator('.load-validation')).toHaveCount(0);
  await window.getByLabel('TPS objetivo').fill('6');
  await expect(start).toBeDisabled();
  await window.getByLabel('TPS objetivo').fill('0.01');
  await expect(start).toBeDisabled();
  await expect(window.locator('.load-validation')).toContainText('entre 0,1 y 5');
  await window.getByLabel('TPS objetivo').fill('5');
  await expect(start).toBeEnabled();
  await window.screenshot({ path: 'artifacts/load-ready.png', fullPage: true });
  await start.click();
  const result = window.getByRole('region', { name: 'Resultado de carga', exact: true });
  await expect(result).toContainText('Completada', { timeout: 10000 });
  await expect(result.locator('.load-metrics')).toContainText('Aprobadas3');
  await expect(result).toContainText('PIN, EMV y contexto');
  await window.screenshot({ path: 'artifacts/load-completed.png', fullPage: true });
  await window.getByRole('button', { name: 'Inicio', exact: true }).click();
  await window.getByRole('button', { name: 'Carga y estrés', exact: true }).click();
  await expect(result).toContainText('Completada');
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await window.getByRole('button', { name: 'Modo avanzado', exact: false }).click();
  await window.getByLabel('Máximo de operaciones').fill('100');
  await start.click();
  await window.getByRole('button', { name: 'Detener prueba', exact: true }).click();
  await expect(result).toContainText('Detenida', { timeout: 10000 });
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await window.getByLabel('Máximo de operaciones').fill('2');
  await window.getByLabel('Duración máxima (segundos)').fill('5');
  await window.getByLabel('Tipo de corrida').selectOption('STRESS');
  await window.getByLabel('Aumento gradual (segundos)').fill('5');
  await expect(start).toBeDisabled();
  await window.getByLabel('Aumento gradual (segundos)').fill('1');
  await start.click();
  await expect(result).toContainText('Completada', { timeout: 10000 });
  await expect(result.locator('.load-metrics')).toContainText('Aprobadas2');
  expect(await window.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});

test('carga: selecciona ambos ATM y conserva su identidad al recuperar resultados', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  await createTestAtm(window, 'Segundo ATM de saldo');
  await window.getByRole('button', { name: 'Editar Segundo ATM de saldo', exact: true }).click();
  await window.getByLabel('Terminal ID', { exact: true }).fill('ATM20524');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await window.getByRole('button', { name: 'Carga y estrés', exact: true }).click();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await window.locator('.load-atm-picker summary').click();
  const first = window.getByRole('checkbox', { name: 'ATM de saldo · ATM20521', exact: true });
  const second = window.getByRole('checkbox', {
    name: 'Segundo ATM de saldo · ATM20524',
    exact: true,
  });
  const start = window.getByRole('button', { name: 'Iniciar prueba', exact: true });
  await first.check();
  await expect(start).toBeEnabled();
  await second.check();
  await expect(first).toBeChecked();
  await expect(second).toBeChecked();
  await expect(start).toBeEnabled();
  await second.uncheck();
  await expect(second).not.toBeChecked();
  await expect(start).toBeEnabled();
  await second.check();
  await window.getByRole('button', { name: 'Modo avanzado', exact: false }).click();
  await window.getByRole('button', { name: '3 TPS', exact: false }).click();
  await expect(window.getByLabel('Operaciones en preparación y envío')).toHaveValue('5');
  await window.getByLabel('Máximo de operaciones').fill('1');
  await expect(start).toBeDisabled();
  await expect(window.locator('.load-validation')).toContainText('al menos una consulta por ATM');
  await window.getByLabel('Máximo de operaciones').fill('4');
  await window.getByLabel('TPS objetivo', { exact: true }).fill('3');
  await window.getByLabel('Operaciones en preparación y envío').selectOption('2');
  await window.getByLabel('Duración máxima (segundos)').fill('10');
  await mkdir('artifacts', { recursive: true });
  await build({
    entryPoints: ['tests/helpers/load-electron.ts'],
    outfile: 'artifacts/load-electron.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  });
  const catalog = await window.evaluate(() => globalThis.window.desktop!.getCatalog('QA'));
  if (!catalog.ok) throw Error('CATALOG');
  const sample = approvedWithdrawalExecution();
  delete sample.withdrawal;
  await app!.evaluate(
    ({ ipcMain }, options) => {
      const require = process.getBuiltinModule('module').createRequire(options.fixture);
      require(options.fixture).install(
        ipcMain,
        options.file,
        options.worker,
        options.sample,
        options.terminals,
        1000,
      );
    },
    {
      fixture: resolve('artifacts/load-electron.cjs'),
      file: join(directory, 'load-two-atms.sqlite'),
      worker: resolve('dist/load-worker.cjs'),
      sample,
      terminals: Object.fromEntries(catalog.value.atms.map((atm) => [atm.id, atm.terminalId])),
    },
  );
  await start.click();
  await expect(first).toBeDisabled();
  await expect(second).toBeDisabled();
  await expect(window.getByLabel('Operaciones en preparación y envío')).toBeDisabled();
  await expect
    .poll(async () => {
      const status = await window.evaluate(() => globalThis.window.desktop!.getLoadRun());
      return status.ok ? status.value?.active : 0;
    })
    .toBe(2);
  const result = window.getByRole('region', { name: 'Resultado de carga', exact: true });
  await expect(result).toContainText('Completada', { timeout: 15000 });
  const snapshot = await window.evaluate(() => globalThis.window.desktop!.getLoadRun());
  if (!snapshot.ok || !snapshot.value) throw Error('NO_RUN');
  expect(snapshot.value.draft.additionalAtms).toHaveLength(1);
  expect(snapshot.value.draft.concurrency).toBe(2);
  await expect(result).toContainText('Objetivo TPS no alcanzado');
  expect(snapshot.value.items.map((item) => item.correlation?.terminalId)).toEqual([
    'ATM20521',
    'ATM20524',
    'ATM20521',
    'ATM20524',
  ]);
  await expect(window.locator('.load-run-table tbody tr')).toHaveCount(4);
  await expect(window.locator('.load-run-table tbody')).toContainText('ATM20524');
  await window.reload();
  await window.getByRole('button', { name: 'Carga y estrés', exact: true }).click();
  await expect(window.locator('.load-run-table tbody tr')).toHaveCount(4);
  await expect(window.locator('.load-run-table tbody')).toContainText('ATM20521');
  await expect(window.locator('.load-run-table tbody')).toContainText('ATM20524');
  await expect(result).toContainText('Objetivo TPS no alcanzado');
  await window.evaluate(() => globalThis.window.scrollTo(0, 0));
  await window.screenshot({ path: 'artifacts/load-two-atms.png', fullPage: true });
  // Render explicit cancellation metadata without changing old financial outcomes.
  const failure = structuredClone(snapshot.value);
  failure.state = 'FAILED';
  failure.message = 'Primer error: PEER_CLOSED. Envío sin respuesta confirmada.';
  failure.items = failure.items.slice(0, 3).map((item, index) => ({
    ...item,
    outcome: index === 0 ? 'PEER_CLOSED' : index === 1 ? 'CONTEXT_ERROR' : 'TRANSPORT_ERROR',
    received: false,
    responseCode: null,
    sent: index !== 1,
    ...(index ? { cancelled: true as const } : {}),
  }));
  await app!.evaluate(({ ipcMain }, run) => {
    ipcMain.removeHandler('load:run:status');
    ipcMain.handle('load:run:status', () => ({ ok: true, value: run }));
  }, failure);
  await expect(result).toContainText('Primer error: PEER_CLOSED');
  await expect(result.locator('.load-metrics')).toContainText('Errores1');
  await expect(result.locator('.load-metrics')).toContainText('Canceladas2');
  await expect(result.locator('.load-metrics')).toContainText('Enviadas sin respuesta2');
  await expect(window.locator('.load-run-table')).toContainText('Cancelada · sin envío');
  await expect(window.locator('.load-run-table')).toContainText('Cancelada · sin respuesta');
  await window.screenshot({ path: 'artifacts/load-cancellation-diagnostics.png', fullPage: true });
});

for (const recovery of ['POLL', 'LATE_REJECTION'] as const) {
  test(`carga: recupera un inicio incierto por ${recovery} sin repetir la solicitud`, async () => {
    test.setTimeout(60000);
    const window = await prepareBalanceSubmission();
    await app!.evaluate(({ ipcMain }) => {
      const state = globalThis as typeof globalThis & {
        loadRecoveryCalls?: number;
        publishLoadRecovery?: () => void;
        rejectLoadRecovery?: () => void;
      };
      let current: LoadRunSnapshot | null = null;
      state.loadRecoveryCalls = 0;
      ipcMain.removeHandler('load:run:status');
      ipcMain.handle('load:run:status', () => ({ ok: true, value: current }));
      ipcMain.removeHandler('load:run:start');
      ipcMain.handle('load:run:start', (_event, request: LoadRunRequest) => {
        state.loadRecoveryCalls!++;
        return new Promise((resolve) => {
          state.publishLoadRecovery = () => {
            current = {
              runId: request.requestId,
              requestId: request.requestId,
              draft: request.draft,
              state: 'COMPLETED',
              active: 0,
              items: [],
              message: 'Resultado sintético recuperado',
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              elapsedMs: 21000,
            };
          };
          state.rejectLoadRecovery = () =>
            resolve({
              ok: false,
              error: { code: 'CONFLICT', message: 'Perfil sintético no disponible; cero envíos.' },
            });
        });
      });
    });
    await window.getByRole('button', { name: 'Carga y estrés', exact: true }).click();
    await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
    const start = window.getByRole('button', { name: 'Iniciar prueba', exact: true });
    await expect(start).toBeEnabled();
    await window.clock.install();
    try {
      await start.click();
      await expect(window.getByRole('button', { name: 'Verificando…' })).toBeDisabled();
      await window.clock.runFor(20001);
      await expect(
        window.getByText('No se confirmó el inicio. Consulta el estado antes de otra solicitud.'),
      ).toBeVisible();
      await expect(start).toBeDisabled();
      await app!.evaluate((_electron, kind) => {
        const state = globalThis as typeof globalThis & {
          publishLoadRecovery?: () => void;
          rejectLoadRecovery?: () => void;
        };
        if (kind === 'POLL') state.publishLoadRecovery!();
        else state.rejectLoadRecovery!();
      }, recovery);
      await window.clock.runFor(1100);
      await expect(
        window.getByText('No se confirmó el inicio. Consulta el estado antes de otra solicitud.'),
      ).toHaveCount(0);
      if (recovery === 'POLL') {
        await expect(window.getByRole('region', { name: 'Resultado de carga' })).toContainText(
          'Completada',
        );
        await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
      } else await expect(window.getByRole('alert')).toContainText('cero envíos');
      await expect(start).toBeEnabled();
      expect(
        await app!.evaluate(
          () =>
            (globalThis as typeof globalThis & { loadRecoveryCalls?: number }).loadRecoveryCalls,
        ),
      ).toBe(1);
    } finally {
      await window.clock.resume();
    }
  });
}

async function launch(development = false) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  app = await electron.launch({
    args: [
      resolve('dist/main.cjs'),
      `--user-data-dir=${directory}`,
      '--simulate-reader',
      ...(development ? ['--dev'] : []),
    ],
    env,
  });
  const window = await app.firstWindow();
  await expect(window.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
  return window;
}

test('Inicio muestra el mismo feed Mediator en QA y PREPROD y controla pausa', async () => {
  test.setTimeout(60000);
  const window = await launch();
  const feed = window.getByRole('region', { name: 'Transacciones en vivo' });
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('mediator:live');
    ipcMain.handle('mediator:live', () => ({
      ok: true,
      value: {
        rows: [
          {
            traceId: '31580471',
            occurredAt: '2026-10-26 12:00:00.000',
            terminalId: 'ATM22004',
            terminalSequence: '6345',
            transactionCode: '003000',
            messageType: 2,
            returnCode: 16,
            cardReference: 'REF-123456ABCDEF',
            valueText: '40',
          },
        ],
        hasMore: true,
        queriedAt: '2026-10-26T17:00:00.000Z',
      },
    }));
  });
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await expect(feed).toContainText('REF-123456ABCDEF', { timeout: 10000 });
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(feed).toContainText('REF-123456ABCDEF', { timeout: 10000 });
  await expect(feed).toContainText('31580471');
  await expect(feed).toContainText('hay más anteriores');
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/dashboard-mediator-live.png', fullPage: true });
  await feed.getByLabel('Buscar transacciones').fill('ABCDEF');
  await expect(feed.locator('tbody tr')).toHaveCount(1);
  await feed.getByLabel('Buscar transacciones').fill('9999');
  await expect(feed).toContainText('No hay filas que coincidan');
  await feed.getByLabel('Buscar transacciones').fill('');
  await feed.getByRole('button', { name: 'Pausar' }).click();
  await expect(feed).toContainText('En pausa');
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('mediator:live');
    ipcMain.handle('mediator:live', () => ({
      ok: false,
      error: { code: 'TIMEOUT', message: 'Mediator no respondió.' },
    }));
  });
  await window.waitForTimeout(5300);
  await expect(feed).not.toContainText('Mediator no respondió.');
  await feed.getByRole('button', { name: 'Reanudar' }).click();
  await expect(feed.getByRole('alert')).toContainText('Mediator no respondió.', { timeout: 10000 });
  await expect(feed).toContainText('REF-123456ABCDEF');
});

async function seedWithdrawalJournal(record: BalanceExecution): Promise<void> {
  const journal = new SqliteBalanceJournal(
    join(directory, 'withdrawal-executions.sqlite'),
    join(directory, 'withdrawal-executions.json'),
    'WITHDRAWAL',
  );
  try {
    await journal.write([record]);
  } finally {
    await journal.close();
  }
}

async function readWithdrawalJournal(): Promise<BalanceExecution[]> {
  const journal = new SqliteBalanceJournal(
    join(directory, 'withdrawal-executions.sqlite'),
    join(directory, 'withdrawal-executions.json'),
    'WITHDRAWAL',
  );
  try {
    return await journal.read();
  } finally {
    await journal.close();
  }
}

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'coonecta-e2e-'));
});

test('impide una segunda instancia sobre el mismo diario financiero', async () => {
  const window = await launch();
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  const binary = createRequire(import.meta.url)('electron') as string;
  const duplicate = spawn(binary, [resolve('dist/main.cjs'), `--user-data-dir=${directory}`], {
    env,
    stdio: 'ignore',
    windowsHide: true,
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolveExit, rejectExit) => {
        duplicate.once('exit', () => resolveExit());
        duplicate.once('error', rejectExit);
      }),
      new Promise<never>((_, rejectTimeout) => {
        timeout = setTimeout(() => rejectTimeout(Error('SECOND_INSTANCE_DID_NOT_EXIT')), 10_000);
      }),
    ]);
    expect(duplicate.exitCode).toBe(0);
    await expect(window.getByRole('heading', { name: 'Estación de pruebas' })).toBeVisible();
    expect(await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(
      1,
    );
  } finally {
    clearTimeout(timeout);
    if (duplicate.exitCode === null) duplicate.kill();
  }
});

test('retiro con reverso: cuenta regresiva, resultado separado y comprobante', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_REVERSAL');
  await window.getByLabel('Monto de prueba').fill('20.00');
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(window.getByRole('radio', { name: 'Retiro + reverso', exact: true })).toBeChecked();
  await expect(window.getByLabel('Espera para el reverso')).toHaveValue('5');
  await window.getByLabel('Espera para el reverso').selectOption('3');
  const built = new NewVisaWithdrawal().build(reversalFixture().lease);
  const withdrawalBody = withdrawalResponse(built.metadata);
  const reversalCodec = new QaVisaReversal(built.wire);
  const reversalWire = reversalCodec.build(withdrawalBody);
  const seed = approvedWithdrawalExecution();
  seed.correlation = {
    stan: built.metadata.stan,
    rrn: built.metadata.rrn,
    terminalId: built.metadata.terminalId,
  };
  seed.messages = {
    request: built.message,
    response: new CapturedVisaBalance('WITHDRAWAL').message(withdrawalBody),
  };
  const reversalMessages = {
    request: reversalCodec.requestMessage(reversalWire),
    response: reversalCodec.responseMessage(reversalResponse(reversalWire.subarray(4)))!,
  };
  reversalCodec.dispose();
  await app!.evaluate(
    ({ ipcMain }, { seed, reversalMessages }) => {
      let saved: typeof seed | null = null;
      ipcMain.removeHandler('transaction:withdrawal:execute');
      ipcMain.removeHandler('transaction:withdrawal:result');
      ipcMain.handle('transaction:withdrawal:result', () => ({ ok: true, value: saved }));
      ipcMain.handle('transaction:withdrawal:execute', async (_event, request) => {
        if (request.reversalDelaySeconds !== 3) throw Error('TEST_PLAN_MISSING');
        saved = {
          ...seed,
          requestId: request.requestId,
          cardReadId: request.cardReadId,
          atmId: request.draft.atmId,
          finishedAt: null,
          reversal: {
            transactionId: seed.cardReadId,
            delaySeconds: 3,
            outcome: 'WAITING',
            dueAt: new Date(Date.now() + 3000).toISOString(),
            finishedAt: null,
            responseCode: null,
            transmissionAttempted: false,
            bytesQueued: 0,
          },
        };
        await new Promise((done) => setTimeout(done, 3000));
        saved = {
          ...saved,
          finishedAt: new Date().toISOString(),
          reversal: {
            ...saved.reversal!,
            outcome: 'APPROVED',
            finishedAt: new Date().toISOString(),
            responseCode: '00',
            transmissionAttempted: true,
            bytesQueued: 400,
            messages: reversalMessages,
          },
        };
        return { ok: true, value: saved };
      });
    },
    { seed, reversalMessages },
  );
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await send.click();
  const flow = window.getByRole('region', { name: 'Flujo de retiro y reverso' });
  await expect(flow).toContainText('s para enviar el reverso');
  await expect(send).toBeDisabled();
  await expect(flow).toContainText('Reverso aceptado por el host');
  const inspector = window.getByRole('region', { name: 'Mensajería de la transacción' });
  await expect(inspector.getByRole('tab', { name: 'Respuesta reverso (0430)' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(
    inspector.getByRole('table', { name: 'Campos del mensaje', exact: true }),
  ).toContainText('0430');
  await inspector.getByRole('tab', { name: 'Reverso (0420)' }).click();
  await expect(inspector).toContainText('Datos de la transacción original');
  await expect(
    inspector.getByRole('table', { name: 'Tags EMV del mensaje', exact: true }),
  ).toContainText('8000040000');
  await expect(
    inspector.getByRole('table', { name: 'Tags EMV del mensaje', exact: true }),
  ).toContainText('••••••••');
  await inspector.getByRole('tab', { name: 'Respuesta reverso (0430)' }).click();
  await expect(window.getByRole('region', { name: 'Resultado', exact: true })).toContainText(
    'Flujo completo',
  );
  await expect(send).toBeDisabled(); // new card required, no repeat
  await mkdir('artifacts', { recursive: true });
  await window.evaluate(() => globalThis.window.scrollTo(0, 0));
  await window.screenshot({ path: 'artifacts/withdrawal-reversal-flow.png' });
  await window.getByRole('button', { name: 'Ver comprobante', exact: true }).first().click();
  const dialog = window.getByRole('dialog', { name: 'Vista previa del comprobante' });
  await expect(dialog).toContainText('Reverso aceptado por el host');
  await expect(dialog).toContainText('Recibidos antes del reverso');
});

test('lector PC/SC usa IPC protegido y mantiene separada la identidad', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  await expect(window.getByRole('region', { name: 'Estado del lector' })).toBeVisible();
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
  await expect(readerPanel.getByRole('heading', { name: 'Lector de tarjetas' })).toBeVisible();
  await expect(readerPanel.locator('.card-read-summary')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Guardar tarjeta', exact: true })).toBeDisabled();
  const refresh = readerPanel.getByRole('button', { name: 'Actualizar', exact: true });
  await expect(refresh).toBeEnabled();
  await refresh.click();
  await expect(refresh).toBeEnabled({ timeout: 15000 });
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
  await expect(readerPanel.locator('.card-read-summary')).toBeVisible();
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
  await expect(panel.locator('.card-read-summary.is-present')).toBeVisible();
  await expect(panel.locator('.card-read-status')).toHaveText('Tarjeta detectada');
  await panel.getByLabel('Lector', { exact: true }).selectOption('CI Contact');
  await expect(panel.locator('.card-read-summary:not(.is-present)')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Guardar tarjeta', exact: true })).toBeDisabled();
  await panel.getByLabel('Lector', { exact: true }).selectOption('CI Contactless');
  await expect(panel.locator('.card-read-status')).toHaveText('Tarjeta detectada');
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/card-reader-detected.png', fullPage: true });
  const refresh = panel.getByRole('button', { name: 'Actualizar', exact: true });
  await setResult(success([{ name: 'CI Contactless', state: 'EMPTY', atr: null }]));
  await refresh.click();
  await expect(panel.locator('.card-read-summary:not(.is-present)')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Guardar tarjeta', exact: true })).toBeDisabled();
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
  await expect(panel.locator('.card-read-summary.is-present')).toBeVisible();
  await expect(panel.locator('.card-read-status')).toHaveText('Tarjeta detectada');
  await setResult(success([]));
  await refresh.click();
  await expect(panel.locator('.card-read-status')).toContainText('Conecta un lector');
  await expect(window.getByRole('button', { name: 'Guardar tarjeta', exact: true })).toBeDisabled();
});

test('Tarjetas permite leer el chip y muestra identidad enmascarada sin enviar transacción', async () => {
  const window = await launch();
  const reading: CardIdentityReading = {
    readId: '2b86d181-9efb-4808-b8a8-876a843876b8',
    readAt: '2026-10-08T20:00:00.000Z',
    readerName: 'CI Reader',
    status: 'READ',
    applications: [],
    applicationId: 'A0000000031010',
    applicationLabel: 'QA CARD',
    panMasked: '412345******4444',
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
    ipcMain.handle('reader:identity:read', () => {
      current = identity;
      return { ok: true, value: identity };
    });
  }, reading);
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  const panel = window.getByRole('region', { name: 'Estado del lector' });
  await panel.getByRole('button', { name: 'Actualizar', exact: true }).click();
  const read = panel.getByRole('button', { name: 'Leer tarjeta', exact: true });
  await expect(read).toBeInViewport();
  await read.click();
  await expect(panel).toContainText(reading.panMasked!);
  await expect(panel).toContainText('QA CARD');
  await expect(panel.getByRole('button', { name: 'Volver a leer' })).toBeVisible();
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
    panMasked: '412345******4444',
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
  await panel.getByText('Opciones y datos del chip', { exact: true }).click();
  const country = panel.getByLabel('País del terminal (ISO numérico)');
  await expect(country).toHaveValue('218');
  const read = panel.getByRole('button', { name: 'Leer tarjeta', exact: true });
  await country.fill('xx');
  await read.click();
  await expect(panel.getByRole('alert')).toContainText('tres dígitos');
  await expect(panel.getByText('QA TESTER', { exact: true })).toHaveCount(0);
  await country.fill('218');
  await read.click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel.getByText('Lectura completada', { exact: true })).toBeVisible();
  await expect(panel.getByText('QA TESTER', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('12/29', { exact: true })).toHaveCount(0);
  await expect(panel.locator('.card-read-summary')).toContainText(reading.panMasked!);
  await panel.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(panel.locator('.card-read-summary')).toContainText(reading.panMasked!);
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/card-identity-synthetic.png', fullPage: true });
});

test('interfaz minimalista: acción principal, requisitos y detalles accesibles', async () => {
  const window = await launch();
  await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1536, 1024),
  );
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window.getByRole('button', { name: 'Opciones y detalles técnicos', exact: true }).click();
  await expect(
    window.getByRole('button', { name: 'Recargar perfiles', exact: true }),
  ).toBeEnabled();
  await window.getByRole('button', { name: 'Opciones y detalles técnicos', exact: true }).click();
  await expect(window.getByRole('region', { name: 'Resultado' })).toBeVisible();
  await expect(window.getByLabel('Referencia documental')).not.toBeVisible();
  await expect(window.getByRole('heading', { name: 'Mensaje ISO8583' })).not.toBeVisible();
  const composition = await window.evaluate(() => {
    const context = document.querySelector('.transaction-context')!.getBoundingClientRect();
    const readiness = document.querySelector('.transaction-result-panel')!.getBoundingClientRect();
    const action = document.querySelector('.transaction-send-actions')!.getBoundingClientRect();
    return {
      aligned: context.top === readiness.top,
      separate: context.right < readiness.left,
      actionVisible: action.bottom < globalThis.window.innerHeight,
      overflow: document.documentElement.scrollWidth > globalThis.window.innerWidth,
    };
  });
  expect(composition).toEqual({
    aligned: true,
    separate: true,
    actionVisible: true,
    overflow: false,
  });
  await expect(
    window.getByRole('button', { name: 'Guardar como caso', exact: true }),
  ).toBeDisabled();
  const documentation = window.locator('.transaction-documentation-details');
  await documentation.locator('summary').first().focus();
  await window.keyboard.press('Enter');
  await expect(window.getByLabel('Referencia documental')).toBeVisible();
  await documentation.locator('summary').first().press('Enter');
  await expect(window.getByLabel('Referencia documental')).not.toBeVisible();
  await window.getByText('Flujo e inspector', { exact: false }).click();
  await expect(window.getByRole('heading', { name: 'Mensaje ISO8583' })).toBeVisible();
  await expect(window.getByRole('tab', { name: 'RAW', exact: true })).toBeDisabled();
  await window.getByText('Flujo e inspector', { exact: false }).click();
  await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1024, 768),
  );
  expect(
    await window.evaluate(
      () => document.documentElement.scrollWidth <= globalThis.window.innerWidth,
    ),
  ).toBe(true);
  await mkdir('artifacts', { recursive: true });
  await window.evaluate(() => globalThis.window.scrollTo(0, 0));
  await window.screenshot({ path: 'artifacts/redesign-transaction-small.png', scale: 'css' });
  await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1536, 1024),
  );
  await window.screenshot({ path: 'artifacts/redesign-transaction-desktop.png', scale: 'css' });
  await window.getByRole('button', { name: 'Ver historial', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Historial', exact: true })).toBeVisible();
});

const transactionIdentity: CardIdentityReading = {
  readId: 'aec7f38a-5e1c-490d-9636-c6d7e4b060d6',
  readAt: '2026-10-11T23:00:00.000Z',
  readerName: 'Synthetic Contact',
  status: 'READ',
  applications: [],
  applicationId: null,
  applicationLabel: 'TEST CARD',
  panMasked: '412345******4444',
  cardholderName: null,
  expiry: null,
};

async function prepareBalanceSubmission() {
  await writeFile(join(directory, 'network-evidence.json'), JSON.stringify(networkEvidence()));
  const window = await launch();
  await installTransactionReader();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de saldo');
  await window.getByRole('button', { name: 'Editar ATM de saldo', exact: true }).click();
  await window.getByLabel('Terminal ID', { exact: true }).fill('ATM20521');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  const settings = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  await settings.getByLabel('Espera de conexión (ms)').fill('1000');
  await settings.getByLabel('Ventana de respuesta (ms)').fill('2000');
  await settings
    .getByRole('button', { name: 'Guardar configuración de envío', exact: true })
    .click();
  await expect(settings.getByRole('status')).toBeVisible();
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window.getByLabel('Perfil ATM', { exact: true }).selectOption({ label: 'ATM de saldo' });
  return window;
}

test('consulta terminada sin respuesta permite retiro de monto personalizado conservando el historial', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await app!.evaluate(({ ipcMain }) => {
    const state = globalThis as typeof globalThis & {
      sentTransactions?: {
        requestId: string;
        operation: string;
        amount: string | null;
        cardReadId: string;
      }[];
    };
    state.sentTransactions = [];
    for (const operation of ['balance', 'withdrawal']) {
      ipcMain.removeHandler(`transaction:${operation}:execute`);
      ipcMain.handle(`transaction:${operation}:execute`, (_event, request) => {
        state.sentTransactions!.push({
          requestId: request.requestId,
          operation,
          amount: request.draft.amount,
          cardReadId: request.cardReadId,
        });
        return {
          ok: true,
          value: {
            requestId: request.requestId,
            runId: request.requestId,
            transactionId: request.requestId,
            environment: 'QA',
            atmId: request.draft.atmId,
            atmRevision: request.draft.atmRevision,
            configurationRevision: request.configurationRevision,
            cardReadId: request.cardReadId,
            startedAt: '2026-10-19T16:16:12.000Z',
            finishedAt: '2026-10-19T16:16:26.000Z',
            scenario: 'LOCAL',
            outcome: operation === 'balance' ? 'PEER_CLOSED' : 'APPROVED',
            frameGenerated: true,
            transmissionAttempted: true,
            bytesQueued: 451,
            elapsedMs: 248,
            correlation: {
              stan: operation === 'balance' ? '650101' : '650102',
              rrn: '6292' + (operation === 'balance' ? '650101' : '650102').padStart(8, '0'),
              terminalId: 'ATM20521',
            },
            responseCode: operation === 'balance' ? null : '00',
            balances: [],
            blockers: [],
            ...(operation === 'withdrawal'
              ? {
                  withdrawal: {
                    transaction: request.draft.transaction,
                    amount: request.draft.amount,
                    account: 'SAVINGS',
                    currency: '840',
                  },
                }
              : {}),
          },
        };
      });
    }
  });
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  const result = window.getByRole('region', { name: 'Resultado', exact: true });
  await send.click();
  await expect(result).toContainText('El destino cerró la conexión');
  await expect(send).toBeDisabled();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByLabel('Monto de prueba').fill('75.25');
  await expect(result).toContainText('Consulta de saldo · QA');
  await expect(send).toBeDisabled();
  await result.getByRole('button', { name: 'Nueva transacción', exact: true }).click();
  await expect(result).toContainText('Aún no hay resultado');
  await expect(
    result.getByRole('button', { name: 'Consultar resultado de saldo', exact: true }),
  ).toHaveCount(0);
  await expect(send).toBeDisabled(); // requires a fresh card read
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('75.25');
  await expect(window.locator('.session-activity tbody tr')).toHaveCount(1);
  await expect(window.locator('.session-activity')).toContainText('El destino cerró la conexión');
  const nextReadId = randomUUID();
  await installTransactionReader(false, nextReadId);
  await window.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(result).toContainText('Retiro autorizado por el host');
  await expect(result).toContainText('Monto solicitado: USD 75.25');
  await expect(window.locator('.session-activity tbody tr')).toHaveCount(2);
  await expect(window.locator('.session-activity')).toContainText('El destino cerró la conexión');
  const sent = await app!.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          sentTransactions?: {
            requestId: string;
            operation: string;
            amount: string | null;
            cardReadId: string;
          }[];
        }
      ).sentTransactions!,
  );
  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({
    operation: 'withdrawal',
    amount: '75.25',
    cardReadId: nextReadId,
  });
  expect(sent[1]!.requestId).not.toBe(sent[0]!.requestId);
  expect(sent[1]!.cardReadId).not.toBe(sent[0]!.cardReadId);
});

test('retiro 91 historico y actual finalizan sin paso de conciliacion y permiten otra solicitud', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  const previous: BalanceExecution = {
    requestId: randomUUID(),
    runId: randomUUID(),
    transactionId: randomUUID(),
    environment: 'QA',
    atmId: await window.getByLabel('Perfil ATM', { exact: true }).inputValue(),
    atmRevision: 1,
    configurationRevision: 1,
    cardReadId: transactionIdentity.readId,
    startedAt: '2026-10-19T16:59:01.000Z',
    finishedAt: '2026-10-19T16:59:25.000Z',
    scenario: 'LOCAL',
    outcome: 'REQUIRES_REVIEW',
    frameGenerated: true,
    transmissionAttempted: true,
    bytesQueued: 451,
    elapsedMs: 9713,
    correlation: { stan: '650114', rrn: '629200' + '650114', terminalId: 'ATM20521' },
    responseCode: '91',
    balances: [],
    blockers: [],
    withdrawal: {
      transaction: 'WITHDRAWAL_APPROVED',
      amount: '20.00',
      currency: '840',
      account: 'SAVINGS',
    },
  };
  // Seed only the isolated application's historical public journal.
  await seedWithdrawalJournal(previous);
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByLabel('Monto de prueba').fill('20.00');
  const result = window.getByRole('region', { name: 'Resultado', exact: true });
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await expect(result).toContainText('Aún no hay resultado');
  await expect(result).not.toContainText('conciliación');
  await expect(result.getByRole('button', { name: 'Nueva prueba QA', exact: true })).toHaveCount(0);
  await expect(send).toBeDisabled();
  await app!.evaluate(({ ipcMain }) => {
    const state = globalThis as typeof globalThis & { nextWithdrawalRequests?: unknown[] };
    state.nextWithdrawalRequests = [];
    ipcMain.removeHandler('transaction:withdrawal:execute');
    ipcMain.handle('transaction:withdrawal:execute', (_event, request) => {
      state.nextWithdrawalRequests!.push({
        requestId: request.requestId,
        cardReadId: request.cardReadId,
      });
      return {
        ok: true,
        value: {
          ...request,
          runId: request.requestId,
          transactionId: request.requestId,
          environment: 'QA',
          atmId: request.draft.atmId,
          atmRevision: request.draft.atmRevision,
          startedAt: '2026-10-19T17:30:00.000Z',
          finishedAt: '2026-10-19T17:30:01.000Z',
          scenario: 'LOCAL',
          outcome: 'NOT_APPROVED',
          frameGenerated: true,
          transmissionAttempted: true,
          bytesQueued: 451,
          elapsedMs: 10,
          correlation: { stan: '650115', rrn: '629200' + '650115', terminalId: 'ATM20521' },
          responseCode: '91',
          balances: [],
          blockers: [],
          withdrawal: {
            transaction: request.draft.transaction,
            amount: request.draft.amount,
            account: 'SAVINGS',
            currency: '840',
          },
        },
      };
    });
  });
  await expect(send).toBeDisabled();
  const saved = await readWithdrawalJournal();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ ...previous });
  expect(saved[0]?.qaContinuation).toBeUndefined();
  const sent = () =>
    app!.evaluate(
      () =>
        (globalThis as typeof globalThis & { nextWithdrawalRequests?: unknown[] })
          .nextWithdrawalRequests!,
    );
  expect(await sent()).toEqual([]);
  const readId = randomUUID();
  await installTransactionReader(false, readId);
  await window.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(result).toContainText('Retiro no aprobado');
  await expect(result).not.toContainText('conciliación');
  await expect(
    result.getByRole('button', { name: 'Consultar resultado de retiro', exact: true }),
  ).toHaveCount(0);
  await expect(result.getByRole('button', { name: 'Nueva prueba QA', exact: true })).toHaveCount(0);
  await expect(send).toBeDisabled(); // only a fresh card read is required
  const requests = await sent();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ cardReadId: readId });
  expect(requests[0]).not.toMatchObject({ requestId: previous.requestId });
  await expect(window.locator('.session-activity tbody tr')).toHaveCount(1);
  await expect(window.locator('.session-activity')).toContainText('Retiro no aprobado');
});

test('retiro RC 59 histórico no ocupa el formulario y un error nuevo permite otro retiro', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  const previous: BalanceExecution = {
    requestId: randomUUID(),
    runId: randomUUID(),
    transactionId: randomUUID(),
    environment: 'QA',
    atmId: await window.getByLabel('Perfil ATM', { exact: true }).inputValue(),
    atmRevision: 1,
    configurationRevision: 1,
    cardReadId: transactionIdentity.readId,
    startedAt: '2026-10-19T22:40:27.321Z',
    finishedAt: '2026-10-19T22:40:40.333Z',
    scenario: 'LOCAL',
    outcome: 'REQUIRES_REVIEW',
    frameGenerated: true,
    transmissionAttempted: true,
    bytesQueued: 451,
    elapsedMs: 449,
    correlation: { stan: '900125', rrn: '629200' + '900125', terminalId: 'ATM20521' },
    responseCode: '59',
    balances: [],
    blockers: [],
    withdrawal: {
      transaction: 'WITHDRAWAL_APPROVED',
      amount: '50.00',
      currency: '840',
      account: 'SAVINGS',
    },
  };
  await seedWithdrawalJournal(previous);
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  const result = window.getByRole('region', { name: 'Resultado', exact: true });
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await expect(result).toContainText('Aún no hay resultado');
  await expect(send).toBeDisabled();
  await app!.evaluate(({ ipcMain }) => {
    const state = globalThis as typeof globalThis & {
      withdrawalsAfter59?: { requestId: string; cardReadId: string; amount: string }[];
    };
    state.withdrawalsAfter59 = [];
    ipcMain.removeHandler('transaction:withdrawal:execute');
    ipcMain.handle('transaction:withdrawal:execute', (_event, request) => {
      state.withdrawalsAfter59!.push({
        requestId: request.requestId,
        cardReadId: request.cardReadId,
        amount: request.draft.amount,
      });
      const first = state.withdrawalsAfter59!.length === 1;
      return {
        ok: true,
        value: {
          requestId: request.requestId,
          runId: request.requestId,
          transactionId: request.requestId,
          environment: 'QA',
          atmId: request.draft.atmId,
          atmRevision: request.draft.atmRevision,
          configurationRevision: request.configurationRevision,
          cardReadId: request.cardReadId,
          startedAt: '2026-10-19T22:41:00.000Z',
          finishedAt: '2026-10-19T22:41:01.000Z',
          scenario: 'LOCAL',
          outcome: first ? 'REQUIRES_REVIEW' : 'APPROVED',
          frameGenerated: true,
          transmissionAttempted: true,
          bytesQueued: 451,
          elapsedMs: 1000,
          correlation: { stan: '900126', rrn: '629200' + '900126', terminalId: 'ATM20521' },
          responseCode: first ? '59' : '00',
          balances: [],
          blockers: [],
          withdrawal: {
            transaction: request.draft.transaction,
            amount: request.draft.amount,
            account: 'SAVINGS',
            currency: '840',
          },
        },
      };
    });
  });
  await window.getByLabel('Monto de prueba').fill('50.00');
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(result).toContainText('Código de respuesta: 59');
  await expect(
    result.getByRole('button', { name: 'Nueva transacción', exact: true }),
  ).toBeVisible();
  await expect(send).toBeDisabled();
  await result.getByRole('button', { name: 'Nueva transacción', exact: true }).click();
  await expect(result).toContainText('Aún no hay resultado');
  await expect(send).toBeDisabled();
  await window.getByLabel('Transacción', { exact: true }).selectOption('BALANCE');
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await expect(result).toContainText('Aún no hay resultado');
  await expect(send).toBeDisabled();
  await window.getByLabel('Monto de prueba').fill('100.00');
  const nextReadId = randomUUID();
  await installTransactionReader(false, nextReadId);
  await window.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await send.click();
  await expect(result).toContainText('Retiro autorizado por el host');
  await expect(result).toContainText('Monto solicitado: USD 100.00');
  const sent = await app!.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          withdrawalsAfter59?: { requestId: string; cardReadId: string; amount: string }[];
        }
      ).withdrawalsAfter59!,
  );
  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ cardReadId: nextReadId, amount: '100.00' });
  expect(new Set([previous.requestId, ...sent.map((item) => item.requestId)]).size).toBe(3);
  expect(sent[0]!.cardReadId).not.toBe(sent[1]!.cardReadId);
  await expect(window.locator('.session-activity tbody tr')).toHaveCount(2);
  expect(await readWithdrawalJournal()).toEqual([previous]);
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/withdrawal-after-error.png', fullPage: true });
});

test('retiro QA: monto, bloqueo real y recuperación conservan la operación original', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByLabel('Monto de prueba').fill('0.00');
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeDisabled();
  await window.getByLabel('Monto de prueba').fill('20.00');
  await expect(send).toBeEnabled();
  await send.click();
  const blocked = window.getByLabel('Resultado de retiro', { exact: true });
  await expect(blocked).toContainText('Retiro bloqueado');
  await expect(blocked).toContainText('No se transmitió el retiro.');
  await expect(blocked).toContainText('No está disponible la plantilla ATM20521');
  await expect(blocked).toContainText('Monto solicitado: USD 20.00');
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({
    path: 'artifacts/withdrawal-qa-blocked.png',
    scale: 'css',
    fullPage: true,
  });

  // The real Main completion publishes the empty simulated reader. Reinsert
  // the IPC reader fixture explicitly before the next isolated UI attempt.
  await installTransactionReader();
  await window.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();

  // Replace only the isolated test application's IPC. No real PIN, chip or TCP.
  await app!.evaluate(({ ipcMain }) => {
    let saved: Record<string, unknown> | undefined;
    ipcMain.removeHandler('transaction:withdrawal:execute');
    ipcMain.handle('transaction:withdrawal:execute', (_event, request) => {
      saved = {
        requestId: request.requestId,
        runId: request.requestId,
        transactionId: request.requestId,
        environment: 'QA',
        atmId: request.draft.atmId,
        atmRevision: request.draft.atmRevision,
        configurationRevision: request.configurationRevision,
        cardReadId: request.cardReadId,
        startedAt: '2026-10-16T20:00:00.000Z',
        finishedAt: '2026-10-16T20:00:01.000Z',
        scenario: 'LOCAL',
        outcome: 'REQUIRES_REVIEW',
        frameGenerated: true,
        transmissionAttempted: true,
        bytesQueued: 548,
        elapsedMs: 10,
        correlation: null,
        responseCode: '96',
        balances: [],
        blockers: [],
        withdrawal: {
          transaction: request.draft.transaction,
          amount: request.draft.amount,
          account: 'SAVINGS',
          currency: '840',
        },
      };
      return { ok: true, value: saved };
    });
    ipcMain.removeHandler('transaction:withdrawal:result');
    ipcMain.handle('transaction:withdrawal:result', (_event, request) => ({
      ok: true,
      value:
        saved?.requestId === request.requestId
          ? { ...saved, outcome: 'APPROVED', responseCode: '00' }
          : null,
    }));
    ipcMain.removeHandler('transaction:balance:result');
    ipcMain.handle('transaction:balance:result', () => ({
      ok: false,
      error: { code: 'CONFLICT', message: 'Canal equivocado.' },
    }));
  });
  await send.click();
  await expect(blocked).toContainText('Respuesta del host por revisar');
  await expect(send).toBeDisabled();
  await expect(
    window
      .getByRole('region', { name: 'Resultado', exact: true })
      .getByRole('button', { name: 'Nueva transacción', exact: true }),
  ).toBeVisible();
  await window.getByLabel('Transacción', { exact: true }).selectOption('BALANCE');
  await window.getByRole('button', { name: 'Consultar resultado de retiro', exact: true }).click();
  await expect(blocked).toContainText('Retiro autorizado por el host');
  await expect(blocked).toContainText('Monto solicitado: USD 20.00');
  await expect(blocked).not.toContainText('Consulta aprobada');
  await expect(
    window.getByRole('button', { name: 'Consultar resultado de retiro', exact: true }),
  ).toHaveCount(0);
  await expect(send).toBeDisabled(); // new operation requires a new card read
});

for (const withPrint of [false, true]) {
  test(`comprobante local de retiro: ${withPrint ? 'con' : 'sin'} impresión, vista previa y reimpresión sin otro envío`, async () => {
    test.setTimeout(60000);
    const window = await prepareBalanceSubmission();
    await app!.evaluate(({ app, ipcMain }, seed) => {
      const state = globalThis as typeof globalThis & {
        receiptTest?: {
          sends: number;
          prints: number;
          saved: typeof seed | null;
          html: string;
          sandbox: boolean;
        };
      };
      state.receiptTest = { sends: 0, prints: 0, saved: null, html: '', sandbox: false };
      ipcMain.removeHandler('transaction:withdrawal:execute');
      ipcMain.handle('transaction:withdrawal:execute', (_event, request) => {
        state.receiptTest!.sends++;
        const value = {
          ...seed,
          requestId: request.requestId,
          atmId: request.draft.atmId,
          atmRevision: request.draft.atmRevision,
          configurationRevision: request.configurationRevision,
          cardReadId: request.cardReadId,
          withdrawal: { ...seed.withdrawal!, amount: request.draft.amount },
        };
        state.receiptTest!.saved = value;
        return { ok: true, value };
      });
      // Only the isolated test app: exercise the real receipt service/HTML/window,
      // substituting the final printer call so no paper or native dialog is used.
      app.on('web-contents-created', (_event, contents) => {
        contents.print = (options, callback) => {
          if (options?.silent !== false) throw Error('TEST_UNEXPECTED_SILENT_PRINT');
          state.receiptTest!.prints++;
          state.receiptTest!.html = decodeURIComponent(
            contents.getURL().split(',').slice(1).join(','),
          );
          state.receiptTest!.sandbox = app
            .getAppMetrics()
            .filter((metric) => metric.type === 'Tab')
            .every((metric) => metric.sandboxed === true);
          if (state.receiptTest!.prints === 1) callback?.(false, 'Print job canceled');
          else if (state.receiptTest!.prints === 2) callback?.(false, 'PRIVATE_DRIVER_ERROR');
          else callback?.(true, '');
        };
      });
    }, approvedWithdrawalExecution());
    await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
    await window.getByLabel('Monto de prueba').fill('20.00');
    await expect(window.getByRole('radio', { name: /^Sin impresión/ })).toBeChecked();
    if (withPrint) await window.getByRole('radio', { name: /^Con impresión/ }).check();
    await window.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
    await window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }).click();
    const dialog = window.getByRole('dialog', { name: 'Vista previa del comprobante' });
    if (withPrint) await expect(dialog).toBeVisible();
    else await expect(dialog).toHaveCount(0);
    const state = await app!.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            receiptTest: { saved: BalanceExecution; sends: number; prints: number };
          }
        ).receiptTest,
    );
    expect(state.sends).toBe(1);
    expect(state.prints).toBe(0);
    await seedWithdrawalJournal(state.saved);
    if (withPrint) await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click();
    const result = window.getByLabel('Resultado de retiro', { exact: true });
    await expect(result).toContainText('USD 123.45');
    await expect(result).toContainText('USD 234.56');
    await expect(result.getByLabel('Importes del retiro')).toContainText('No confirmado');
    await expect(result.getByLabel('Importes del retiro')).toContainText('Sin identificar');
    await app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 980),
    );
    await window.evaluate(() => globalThis.window.scrollTo(0, 0));
    await window.screenshot({
      path: `artifacts/withdrawal-result-${withPrint ? 'print' : 'screen'}.png`,
      scale: 'css',
    });
    await result.getByRole('button', { name: 'Ver comprobante', exact: true }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('USD 20.00');
    await expect(dialog).toContainText('USD 123.45');
    await window.screenshot({ path: 'artifacts/withdrawal-receipt-preview.png', scale: 'css' });
    const print = dialog.getByRole('button', { name: 'Imprimir comprobante', exact: true });
    await print.click();
    await expect(dialog.getByRole('status')).toContainText('Impresión cancelada');
    await print.click();
    await expect(dialog.getByRole('alert')).toContainText('No se pudo imprimir');
    await expect(dialog).not.toContainText('PRIVATE_DRIVER_ERROR');
    await print.click();
    await expect(dialog.getByRole('status')).toContainText('cola de impresión');
    const printed = await app!.evaluate(
      () =>
        (
          globalThis as typeof globalThis & {
            receiptTest: { sends: number; prints: number; html: string; sandbox: boolean };
          }
        ).receiptTest,
    );
    expect(printed).toMatchObject({ sends: 1, prints: 3, sandbox: true });
    expect(printed.html).toContain(state.saved.transactionId);
    expect(printed.html).toContain('USD 123.45');
    expect(printed.html).not.toContain('PRIVATE_DRIVER_ERROR');
    await window.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await app!.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]?.setContentSize(1040, 768),
    );
    expect(
      await window.evaluate(() => document.documentElement.scrollWidth <= globalThis.innerWidth),
    ).toBe(true);
    await result.getByRole('button', { name: 'Ver comprobante', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Imprimir comprobante', exact: true }),
    ).toBeInViewport();
    await window.screenshot({ path: 'artifacts/withdrawal-receipt-compact.png', scale: 'css' });
    await window.keyboard.press('Escape');
    expect(await readWithdrawalJournal()).toEqual([state.saved]);
  });
}

test('consulta de saldo: envío directo, dependencia ausente y resultado mediante IPC sintético', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await expect(send).toBeDisabled();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeVisible();
  await app?.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1536, 1024),
  );
  await window.evaluate(() => globalThis.window.scrollTo(0, 0));
  await window.screenshot({ path: 'artifacts/redesign-prepared-desktop.png', scale: 'css' });
  await expect(window.getByRole('region', { name: 'Actividad de esta sesión' })).toBeInViewport();
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
  await expect(send).toBeDisabled();
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('SAVINGS');
  await expect(send).toBeEnabled();
  await expect(window.locator('.composer-options')).not.toHaveAttribute('open');
  await expect(
    window.getByRole('button', { name: 'Revisar transacción', exact: true }),
  ).not.toBeVisible();
  // Real Main has no financial provider in this isolated userData. Clicking
  // submits the request, but its validation must stop before PIN or transport.
  await send.click();
  const blocked = window.getByLabel('Resultado de consulta de saldo', { exact: true });
  await expect(blocked).toContainText('Consulta bloqueada');
  await expect(blocked).toContainText('No se transmitió la consulta.');
  await expect(blocked).toContainText('No está disponible la plantilla ATM20521');
  await expect(window.locator('.session-activity tbody tr')).toHaveCount(1);
  await expect(window.locator('.session-activity')).toContainText('Consulta bloqueada');
  // Main's completion event reports its empty simulated hardware, independently
  // of the reader IPC fixture. Restore that fixture before another UI attempt.
  await installTransactionReader();
  await picker.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await expect(
    window.getByRole('button', { name: 'Consultar resultado de saldo', exact: true }),
  ).toHaveCount(0);
  // UI verification only. These handlers never construct or transmit a wire request.
  await app!.evaluate(
    ({ ipcMain }, ids) => {
      const state = globalThis as typeof globalThis & {
        balanceUiCalls?: number;
        finishBalanceUi?: () => void;
        lastBalanceUi?: unknown;
      };
      state.balanceUiCalls = 0;
      ipcMain.removeHandler('transaction:balance:readiness');
      ipcMain.handle('transaction:balance:readiness', () => ({
        ok: true,
        value: { ready: true, blockers: [] },
      }));
      ipcMain.removeHandler('transaction:balance:execute');
      ipcMain.handle('transaction:balance:execute', (_event, request) => {
        state.balanceUiCalls!++;
        const value = {
          requestId: request.requestId,
          runId: ids.runId,
          transactionId: ids.transactionId,
          environment: 'QA',
          atmId: request.draft.atmId,
          atmRevision: request.draft.atmRevision,
          configurationRevision: request.configurationRevision,
          cardReadId: request.cardReadId,
          scenario: request.draft.scenario,
          startedAt: '2026-10-12T20:00:00.000Z',
          finishedAt: '2026-10-12T20:00:01.000Z',
          outcome: 'APPROVED',
          frameGenerated: true,
          transmissionAttempted: true,
          bytesQueued: 536,
          elapsedMs: 1000,
          correlation: {
            stan: '007923',
            rrn: '6' + '281' + String(7923).padStart(8, '0'),
            terminalId: 'ATM20521',
          },
          responseCode: '00',
          balances: [{ accountCode: '10', type: '02', currency: '840', amount: '123.45' }],
          blockers: [],
        };
        return new Promise((resolve) => {
          state.finishBalanceUi = () => {
            state.lastBalanceUi = value;
            resolve({ ok: true, value });
          };
        });
      });
      ipcMain.removeHandler('transaction:balance:result');
      ipcMain.handle('transaction:balance:result', () => ({
        ok: true,
        value: state.lastBalanceUi,
      }));
      ipcMain.removeHandler('transaction:balance:history');
      ipcMain.handle('transaction:balance:history', () => ({
        ok: true,
        value: state.lastBalanceUi ? [state.lastBalanceUi] : [],
      }));
    },
    { runId: randomUUID(), transactionId: randomUUID() },
  );
  await expect(send).toBeEnabled();
  await expect(window.getByLabel('Disponibilidad de la transacción')).not.toBeVisible();
  await expect(window.getByRole('textbox', { name: /PIN/i })).toHaveCount(0);
  await send.click();
  await expect(
    window.getByRole('button', { name: 'Consultando saldo…', exact: true }),
  ).toBeDisabled();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await app!.evaluate(() => {
    (globalThis as typeof globalThis & { finishBalanceUi?: () => void }).finishBalanceUi?.();
  });
  const result = window.getByLabel('Resultado de consulta de saldo', { exact: true });
  await expect(result).toContainText('Consulta aprobada');
  await expect(result).toContainText('123.45');
  await expect(result).toContainText('USD');
  await expect(window.getByLabel('Plan de envío', { exact: true })).toHaveCount(0);
  await expect(send).toBeDisabled();
  expect(
    await app!.evaluate(
      () => (globalThis as typeof globalThis & { balanceUiCalls?: number }).balanceUiCalls,
    ),
  ).toBe(1);
  await expect(
    window.getByRole('button', { name: 'Consultar resultado de saldo', exact: true }),
  ).toHaveCount(0);
  await expect(window.locator('#send-blocked-note')).toContainText('Operación finalizada');
  await expect(result).toContainText('Código de respuesta: 00');
  await expect(window.locator('.session-activity tbody tr')).toHaveCount(2);
  await expect(window.locator('.session-activity')).toContainText('Consulta aprobada');
  await result.scrollIntoViewIfNeeded();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/balance-inquiry-result.png' });
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(window.locator('.session-activity')).not.toContainText('Consulta aprobada');
  await expect(window.locator('.session-empty')).toBeVisible();
});

for (const outcome of [
  'VALIDATION_ERROR',
  'STORAGE_UNAVAILABLE',
  'CONTEXT_ERROR',
  'CONNECT_TIMEOUT',
  'RESPONSE_TIMEOUT',
  'IPC_REJECTED',
] as const) {
  test(`consulta directa recupera bloqueos previos y conserva entrega incierta: ${outcome}`, async () => {
    test.setTimeout(60000);
    const window = await prepareBalanceSubmission();
    await window
      .getByLabel('Elegir tarjeta', { exact: true })
      .getByRole('button', { name: 'Leer tarjeta', exact: true })
      .click();
    await app!.evaluate(({ ipcMain }, outcome) => {
      const state = globalThis as typeof globalThis & { submissionIds?: string[] };
      state.submissionIds = [];
      ipcMain.removeHandler('transaction:balance:execute');
      ipcMain.handle('transaction:balance:execute', (_event, request) => {
        state.submissionIds!.push(request.requestId);
        if (outcome === 'IPC_REJECTED') throw Error('Synthetic IPC failure');
        if (outcome === 'VALIDATION_ERROR' || outcome === 'STORAGE_UNAVAILABLE')
          return {
            ok: false,
            error: { code: outcome, message: 'Fallo previo al envío sintético' },
          };
        return {
          ok: true,
          value: {
            requestId: request.requestId,
            runId: request.requestId,
            transactionId: request.requestId,
            environment: 'QA',
            atmId: request.draft.atmId,
            atmRevision: request.draft.atmRevision,
            configurationRevision: request.configurationRevision,
            cardReadId: request.cardReadId,
            scenario: 'LOCAL',
            startedAt: '2026-10-14T00:00:00.000Z',
            finishedAt: '2026-10-14T00:00:01.000Z',
            outcome,
            frameGenerated: outcome !== 'CONTEXT_ERROR',
            transmissionAttempted: outcome === 'RESPONSE_TIMEOUT',
            bytesQueued: outcome === 'RESPONSE_TIMEOUT' ? 536 : 0,
            elapsedMs: 1000,
            correlation: null,
            responseCode: null,
            balances: [],
            blockers: [{ id: 'SYNTHETIC', label: 'Diagnóstico de prueba local' }],
          },
        };
      });
    }, outcome);
    const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
    await expect(send).toBeEnabled();
    await send.click();
    await expect(send).toBeVisible();
    if (outcome === 'IPC_REJECTED' || outcome === 'RESPONSE_TIMEOUT') {
      await expect(send).toBeDisabled();
      await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
      await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('SAVINGS');
      await expect(send).toBeDisabled();
      await expect(
        window.getByRole('button', { name: 'Consultar resultado de saldo', exact: true }),
      ).toBeVisible();
    } else {
      await expect(send).toBeEnabled();
      await expect(
        window.getByRole('button', { name: 'Consultar resultado de saldo', exact: true }),
      ).toHaveCount(0);
      await send.click();
      await expect(send).toBeEnabled();
    }
    const ids = await app!.evaluate(
      () => (globalThis as typeof globalThis & { submissionIds?: string[] }).submissionIds!,
    );
    expect(ids).toHaveLength(outcome === 'IPC_REJECTED' || outcome === 'RESPONSE_TIMEOUT' ? 1 : 2);
    expect(new Set(ids).size).toBe(ids.length);
  });
}

test('consulta directa conserva la referencia tras timeout y no reenvía al editar', async () => {
  test.setTimeout(60000);
  const window = await prepareBalanceSubmission();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeVisible();
  await app!.evaluate(({ ipcMain }) => {
    const state = globalThis as typeof globalThis & { uncertainBalanceCalls?: number };
    state.uncertainBalanceCalls = 0;
    ipcMain.removeHandler('transaction:balance:execute');
    ipcMain.handle('transaction:balance:execute', () => {
      state.uncertainBalanceCalls!++;
      return new Promise(() => undefined);
    });
  });
  await window.clock.install();
  await window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }).click();
  await expect(
    window.getByRole('button', { name: 'Consultando saldo…', exact: true }),
  ).toBeDisabled();
  await window.clock.fastForward(180001);
  await expect(window.getByRole('alert')).toContainText('No se conoce el resultado.');
  await expect(
    window
      .getByRole('region', { name: 'Resultado', exact: true })
      .getByRole('button', { name: 'Nueva transacción', exact: true }),
  ).toHaveCount(0);
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await expect(send).toBeDisabled();
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('SAVINGS');
  await expect(send).toBeDisabled();
  await expect(
    window.getByRole('button', { name: 'Consultar resultado de saldo', exact: true }),
  ).toBeVisible();
  expect(
    await app!.evaluate(
      () =>
        (globalThis as typeof globalThis & { uncertainBalanceCalls?: number })
          .uncertainBalanceCalls,
    ),
  ).toBe(1);
});
async function installTransactionReader(
  failRead = false,
  readId = transactionIdentity.readId,
  card = transactionIdentity,
) {
  await app!.evaluate(
    ({ ipcMain }, args) => {
      let identity: typeof args.identity | null = null;
      ipcMain.removeHandler('reader:inspect');
      ipcMain.handle('reader:inspect', () => ({
        ok: true,
        value: {
          checkedAt: args.identity.readAt,
          identityStatus: identity ? 'READ' : 'NOT_READ',
          readers: [{ name: args.identity.readerName, state: 'CARD_PRESENT', atr: '3B00' }],
          identity,
        },
      }));
      ipcMain.removeHandler('reader:identity:read');
      ipcMain.handle('reader:identity:read', (_event, request) => {
        if (args.failRead)
          return {
            ok: false,
            error: { code: 'TIMEOUT', message: 'La lectura de tarjeta agotó el tiempo de espera.' },
          };
        if (
          request.readerName !== args.identity.readerName ||
          request.terminalCountryCode !== '218'
        )
          return {
            ok: false,
            error: { code: 'VALIDATION_ERROR', message: 'Selección de lector inválida.' },
          };
        identity = args.identity;
        return { ok: true, value: identity };
      });
    },
    { identity: { ...card, readId }, failRead },
  );
}

test('formulario directo: lectura selecciona la tarjeta, revisión opcional e invalidación al retirar', async () => {
  const window = await launch();
  await installTransactionReader();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de preparación guiada');
  await window.getByRole('button', { name: 'Inicio', exact: true }).click();
  await window.getByRole('button', { name: 'Nueva transacción', exact: true }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de preparación guiada' });
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
  await window.getByLabel('Monto de prueba').fill('100.50');
  await expect(window.getByRole('heading', { name: 'Tarjeta', exact: true })).toBeVisible();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await expect(picker.getByRole('button', { name: 'Leer tarjeta', exact: true })).toBeEnabled();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByText(transactionIdentity.panMasked!, { exact: true })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeVisible();
  const preview = window.getByLabel('Resumen de la transacción');
  await expect(preview).toContainText('ATM de preparación guiada');
  await expect(preview).toContainText('Corriente');
  await expect(preview).toContainText('100.50');
  await expect(preview).toContainText(transactionIdentity.panMasked!);
  await reviewDraft(window);
  await expect(window.getByLabel('Contexto revisado', { exact: true })).toBeVisible();
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
  await expect(window.locator('.transaction-steps')).toHaveCount(0);
  await window.getByRole('button', { name: 'Historial', exact: true }).click();
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await expect(preview).toContainText(transactionIdentity.panMasked!);
  await mkdir('artifacts', { recursive: true });
  await window.evaluate(() => globalThis.window.scrollTo(0, 0));
  await window.screenshot({
    path: 'artifacts/guided-transaction.png',
    fullPage: true,
    scale: 'css',
  });
  await app!.evaluate(({ ipcMain }, identity) => {
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => ({
      ok: true,
      value: {
        checkedAt: identity.readAt,
        identityStatus: 'NOT_READ',
        readers: [{ name: identity.readerName, state: 'EMPTY', atr: null }],
        identity: null,
      },
    }));
  }, transactionIdentity);
  await picker.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await expect(preview).toContainText('Pendiente de seleccionar');
  await expect(window.getByLabel('Contexto revisado', { exact: true })).toHaveCount(0);
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(preview).toContainText('Pendiente de seleccionar');
});

test('formulario directo valida entradas y recupera un timeout de lectura', async () => {
  const window = await launch();
  await installTransactionReader(true);
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await expect(window.locator('#send-blocked-note')).toContainText('Selecciona un perfil ATM');
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
  await expect(window.getByRole('button', { name: 'Crear entidad', exact: true })).toBeVisible();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM para validación guiada');
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM para validación guiada' });
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByLabel('Monto de prueba').fill('100,50');
  await reviewDraft(window);
  await expect(window.getByLabel('Monto de prueba')).toBeFocused();
  await expect(window.getByRole('alert')).toContainText('punto y dos decimales');
  await window.getByLabel('Monto de prueba').fill('100.50');
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('alert')).toContainText('tiempo de espera');
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
  await expect(window.getByLabel('Resumen de la transacción')).toContainText(
    'Pendiente de seleccionar',
  );
  await installTransactionReader(false);
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('alert')).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeEnabled();
});

test('revisión documental opcional con lector no disponible', async () => {
  const window = await launch();
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => ({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Lector no disponible.' },
    }));
  });
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await expect(picker.getByRole('alert')).toContainText('Lector no disponible');
  await expect(picker.getByRole('button', { name: 'Leer tarjeta', exact: true })).toBeDisabled();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
  await reviewDraft(window);
  await expect(window.getByLabel('Resumen de la transacción')).toContainText(
    'Pendiente de seleccionar',
  );
  await expect(window.getByLabel('Contexto revisado', { exact: true })).toBeVisible();
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
});

test('muestra evidencia de capturas sin habilitar envío ni RAW', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window.getByText('Documentación y capturas', { exact: true }).click();
  const evidence = window.getByLabel('Evidencia de capturas');
  await expect(evidence.getByRole('heading', { name: '10 archivos · 218 mensajes' })).toBeVisible();
  await expect(evidence.getByText('2 bytes, big endian; incluye el prefijo')).toBeVisible();
  await evidence.getByText('Ver archivos y MTI', { exact: true }).click();
  await expect(evidence.locator('li')).toHaveCount(10);
  await expect(evidence.getByText('Formato pendiente de identificar')).toHaveCount(6);
  await expect(
    evidence.getByText('CertificacionMandatoVisa29092026_CRBanred.pcap', { exact: true }),
  ).toBeVisible();
  await window.getByText('Flujo e inspector', { exact: false }).click();
  await expect(window.getByRole('tab', { name: 'RAW', exact: true })).toBeDisabled();
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await window.getByText('Documentación y capturas', { exact: true }).click();
  await expect(evidence.getByRole('heading', { name: '10 archivos · 218 mensajes' })).toBeVisible();
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
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
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
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

test('Historial muestra mandatorios CMS y variantes sin exponer valores', async () => {
  const window = await launch();
  const batch = observationBatch();
  const decoded = decodeResponse(
    JSON.stringify({
      ok: true,
      value: {
        ...batch,
        rows: [
          {
            ...batch.rows[0],
            transactionCode: '301000',
            requestStructure:
              '<ExtremeMsg><Header><HField name="TerminalId">[PROTEGIDO]</HField></Header><Data><DField name="Pais">[PROTEGIDO]</DField><DField name="EsPos" type="b">[PROTEGIDO]</DField></Data></ExtremeMsg>',
            responseStructure:
              '<ExtremeMsg><Header></Header><Data><DField name="MensajeRetorno">[PROTEGIDO]</DField></Data></ExtremeMsg>',
          },
        ],
      },
    }),
    50,
  );
  if (!decoded.ok) throw new Error('SYNTHETIC_CONTRACT_INVALID');
  await app!.evaluate(({ ipcMain }, value) => {
    ipcMain.removeHandler('observations:search');
    ipcMain.handle('observations:search', () => ({
      ok: true,
      value: { ...value, queryId: 'synthetic-cms-review', queriedAt: '2026-10-08T22:00:00.000Z' },
    }));
  }, decoded.value);
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await window.getByRole('button', { name: 'Historial', exact: false }).click();
  const observer = window.getByLabel('Consulta de Mediator', { exact: true });
  await observer.getByRole('button', { name: 'Consultar Mediator' }).click();
  await observer.getByRole('button', { name: `Ver mensajes de ${batch.rows[0]!.traceId}` }).click();
  const reviews = observer.getByLabel('Revisión de campos CMS');
  await expect(reviews).toHaveCount(2);
  await expect(reviews.first()).toContainText('26 campos mandatorios');
  await expect(reviews.first()).toContainText('Header.TraceId');
  await expect(reviews.first()).toContainText('TerminalId (tabla: TerminalID)');
  await expect(reviews.first()).toContainText('Pais (tabla: País)');
  await expect(reviews.first()).toContainText('Data.EsPos: b (tabla: string)');
  await expect(reviews.last()).toContainText('MensajeRetorno (tabla: Mensaje de Retorno)');
  await expect(observer.locator('pre').first()).toContainText('[PROTEGIDO]');
  await window.screenshot({ path: 'artifacts/cms-contract-observer.png', fullPage: true });
});

test('dashboard real, aislamiento, navegación y gate transaccional', async () => {
  const window = await launch();
  await expect(window.locator('.sidebar-station')).toContainText('Estación QA');
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
  await reviewDraft(window);
  await expect(window.getByText('Revisión documental · QA')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
  await window
    .getByRole('combobox', { name: 'Transacción', exact: true })
    .selectOption('TIMEOUT_REVERSAL');
  await expect(window.getByText('Revisión documental · QA')).toHaveCount(0);
  await reviewDraft(window);
  await window.getByText('Ver revisión detallada', { exact: true }).click();
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
  await expect(window.locator('.sidebar-station')).toContainText('Estación QA');
  expect(pageErrors).toEqual([]);
});

async function openComposerOptions(window: Page) {
  const options = window.locator('.composer-options');
  if ((await options.getAttribute('open')) === null)
    await options.locator('summary').first().click();
}
async function reviewDraft(window: Page) {
  await openComposerOptions(window);
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeEnabled();
  await expect(
    window.getByRole('button', { name: 'Recargar perfiles', exact: true }),
  ).toBeEnabled();
  await window.getByRole('button', { name: 'Revisar transacción', exact: true }).click();
}
async function openPreparationDetails(window: Page) {
  await openComposerOptions(window);
  if ((await window.locator('.preparation-details').getAttribute('open')) === null)
    await window.getByText('Preparación y pendientes documentales', { exact: true }).click();
}

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

test('crear ATM desde plantilla hereda adquirente y resuelve envío en Main sin reiniciar', async () => {
  const evidence = networkEvidence();
  await writeFile(join(directory, 'network-evidence.json'), JSON.stringify(evidence));
  const window = await launch();
  await window.getByRole('button', { name: 'Entidades', exact: true }).click();
  await window.getByRole('button', { name: 'Nueva entidad' }).click();
  await window.getByLabel('Código de entidad').fill('205');
  await window.getByLabel('Nombre de entidad').fill('Entidad plantilla');
  await window.getByLabel('Red de entidad').selectOption('COONECTA');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await window.getByRole('button', { name: 'Perfiles ATM', exact: true }).click();
  await window.getByRole('button', { name: 'Nuevo perfil ATM' }).click();
  await window.getByLabel('Alias ATM').fill('Plantilla funcional');
  await window.getByLabel('Entidad del ATM').selectOption({ label: '205 · Entidad plantilla' });
  await window.getByLabel('Terminal ID', { exact: true }).fill('ATM20521');
  await window.getByLabel('Acquirer ID', { exact: true }).fill('12345678901');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('button', { name: 'Editar Plantilla funcional' })).toBeVisible();
  const readAtm = (terminal: string) => {
    const database = new DatabaseSync(join(directory, 'catalogs.sqlite'), { readOnly: true });
    try {
      return database
        .prepare('SELECT id,revision FROM atm_profiles WHERE terminal_id=?')
        .get(terminal)!;
    } finally {
      database.close();
    }
  };
  const source = readAtm('ATM20521');
  const fixture = qaExecutionFixture();
  fixture.row.atmId = String(source.id);
  fixture.row.endpoint = evidence.ingress;
  await writeFile(join(directory, 'qa-execution-profiles.json'), JSON.stringify(fixture.input));
  await window.getByRole('button', { name: 'Nuevo perfil ATM' }).click();
  await expect(window.getByLabel('Acquirer ID', { exact: true })).toHaveValue('12345678901');
  await expect(window.getByLabel('Entidad del ATM')).not.toHaveValue('');
  await window.getByLabel('Alias ATM').fill('Nuevo desde plantilla');
  await window.getByLabel('Terminal ID', { exact: true }).fill('incorrecto');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('alert')).toContainText('ocho');
  await window.getByLabel('Terminal ID', { exact: true }).fill('ATM20524');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('button', { name: 'Editar Nuevo desde plantilla' })).toBeVisible();
  const created = readAtm('ATM20524');
  const result = await window.evaluate(
    async (request) => {
      const config = await globalThis.window.desktop!.getSendConfiguration('QA');
      if (!config.ok || !config.value.configuration) throw Error('TEST_CONFIG_MISSING');
      return globalThis.window.desktop!.getBalanceReadiness({
        ...request,
        configurationRevision: config.value.configuration.revision,
      });
    },
    {
      cardReadId: fixture.target.cardReadId,
      draft: {
        ...fixture.target.draft,
        atmId: String(created.id),
        atmRevision: Number(created.revision),
      },
    },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error('TEST_READINESS_FAILED');
  expect(result.value.sequencesRemaining).toBe(2);
  expect(result.value.blockers.map((item) => item.id)).toEqual(
    expect.arrayContaining(['QA-PIN-TEST-KEY', 'QA-CARD-SESSION']),
  );
  expect(result.value.blockers.some((item) => /TEMPLATE|PROFILE|SEQUENCE/.test(item.id))).toBe(
    false,
  );
  await window.screenshot({ path: 'artifacts/atm-template-created.png' });
  expect(
    JSON.parse(await readFile(join(directory, 'qa-execution-profiles.json'), 'utf8')).profiles,
  ).toHaveLength(1);
});

test('clonación ATM exige nueva identidad y conserva el origen', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de origen');
  await window.getByRole('button', { name: 'Clonar ATM de origen' }).click();
  await expect(window.getByLabel('Alias ATM')).toHaveValue('');
  await expect(window.getByLabel('Terminal ID', { exact: true })).toHaveValue('');
  await expect(window.getByLabel('Acquirer ID', { exact: true })).toHaveValue('Test-Acquirer');
  await expect(window.getByLabel('Entidad del ATM')).not.toHaveValue('');
  await window.getByLabel('Alias ATM').fill('ATM clonado');
  await window.getByLabel('Terminal ID', { exact: true }).fill('Test-Terminal');
  await window.getByLabel('Acquirer ID', { exact: true }).fill('Test-Acquirer-2');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('alert')).toContainText('Terminal ID');
  await window.getByLabel('Terminal ID', { exact: true }).fill('Test-Terminal-2');
  await window.getByRole('button', { name: 'Guardar borrador' }).click();
  await expect(window.getByRole('button', { name: 'Editar ATM de origen' })).toBeVisible();
  await expect(window.getByRole('button', { name: 'Editar ATM clonado' })).toBeVisible();
});

test('casos locales: validación, reinicio, carga, separación de ambientes y eliminación', async () => {
  let window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de casos');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window.getByLabel('Perfil ATM', { exact: true }).selectOption({ label: 'ATM de casos' });
  await openComposerOptions(window);
  await window.getByLabel('Escenario', { exact: true }).selectOption('BANRED');
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await expect(
    window.getByRole('button', { name: 'Guardar como caso', exact: true }),
  ).toBeDisabled();
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
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
  await expect(window.getByRole('combobox', { name: 'Cuenta', exact: true })).toHaveValue(
    'CURRENT',
  );
  await expect(window.getByLabel('Escenario', { exact: true })).toHaveValue('BANRED');
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).not.toHaveValue('');
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
  await expect(window.getByLabel('Contexto revisado', { exact: true })).toHaveCount(0);
  await reviewDraft(window);
  await expect(window.getByText('Revisión documental · QA')).toBeVisible();
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
    .selectOption({ label: 'ATM de caso obsoleto' });
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
    .selectOption({ label: 'ATM de caso actualizado' });
  await reviewDraft(window);
  await expect(window.getByLabel('Contexto revisado', { exact: true })).toContainText('versión 2');
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
});

test('fallo al guardar un caso exige recargar antes de reintentar', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de guardado concurrente');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de guardado concurrente' });
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
    .selectOption({ label: 'ATM de recuperación de casos' });
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
  await expect(window.locator('.transaction-steps')).toHaveCount(0);
  await window.getByText('Documentación y capturas', { exact: true }).click();
  await window.getByText('Flujo e inspector', { exact: false }).click();
  const reference = window.locator('.documented-operation');
  await expect(reference.getByText('301000', { exact: true })).toBeVisible();
  await expect(reference).toContainText('Extreme Mediator CMS v3.6 · p. 20');
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
  await expect(reference.getByText('302000', { exact: true })).toBeVisible();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de preparación QA' });
  await expect(window.getByLabel('Perfil ATM', { exact: true })).not.toHaveValue('');
  await reviewDraft(window);
  await expect(window.getByText('Revisión documental · QA')).toBeVisible();
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
  await expect(window.getByRole('tab', { name: 'RAW', exact: true })).toBeDisabled();
  await expect(window.getByRole('tab', { name: 'HEX', exact: true })).toBeDisabled();
  await expect(window.getByText('Sin mensaje recibido', { exact: true })).toBeVisible();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await expect(window.getByText('Revisión documental · QA')).toHaveCount(0);
  await expect(reference.getByText('012000', { exact: true })).toBeVisible();
  await window.getByLabel('Monto de prueba').fill('100,50');
  await reviewDraft(window);
  await expect(window.getByRole('alert')).toContainText('punto y dos decimales');
  await window.getByLabel('Monto de prueba').fill('100.50');
  await reviewDraft(window);
  await expect(window.getByText('Revisión documental · QA')).toBeVisible();
  await openPreparationDetails(window);
  await expect(window.getByText('Reglas financieras del monto', { exact: true })).toBeVisible();
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('SAVINGS');
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
  await expect(window.getByText('Revisión documental · QA')).toHaveCount(0);
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toBeDisabled();
  await reviewDraft(window);
  await expect(window.getByText('Revisión documental · PREPROD')).toBeVisible();
  await expect(window.locator('.session-empty')).toContainText('No se han enviado transacciones');
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await window.getByLabel('Transacción', { exact: true }).selectOption('TIMEOUT_REVERSAL');
  await expect(window.getByRole('combobox', { name: 'Cuenta', exact: true })).toBeDisabled();
  await expect(reference.getByText('TrnCode CMS', { exact: true })).toHaveCount(0);
  await reviewDraft(window);
  await openPreparationDetails(window);
  await expect(
    window.getByText('Retiro original y política de timeout', { exact: true }),
  ).toBeVisible();
  await expect(window.locator('.transaction-steps')).toHaveCount(0);
});

test('preparación rechaza ATM editado y recupera el contexto al recargar', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM para concurrencia');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM para concurrencia' });
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
  await reviewDraft(window);
  const confirmation = window.getByRole('region', { name: 'Resultado' });
  await expect(confirmation.getByRole('alert')).toContainText('El ATM cambió');
  await expect(window.getByText('Revisión documental · QA')).toHaveCount(0);
  await window.getByRole('button', { name: 'Recargar perfiles' }).click();
  await expect(confirmation.getByRole('alert')).toHaveCount(0);
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await window.getByLabel('Perfil ATM', { exact: true }).selectOption({ label: 'ATM actualizado' });
  await reviewDraft(window);
  await expect(window.getByText('Revisión documental · QA')).toBeVisible();
});

test('plantillas documentales, resumen revisado y borrador conservado al navegar', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de plantillas');
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de plantillas' });
  await openComposerOptions(window);
  await window.getByLabel('Escenario', { exact: true }).selectOption('RTC');
  await openComposerOptions(window);
  await window.getByLabel('Plantilla documental').selectOption('WITHDRAWAL_APPROVED:CURRENT');
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue(
    'WITHDRAWAL_APPROVED',
  );
  await expect(window.getByRole('combobox', { name: 'Cuenta', exact: true })).toHaveValue(
    'CURRENT',
  );
  await expect(window.getByLabel('Escenario', { exact: true })).toHaveValue('RTC');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).not.toHaveValue('');
  await openPreparationDetails(window);
  await expect(window.getByText('Reglas financieras del monto', { exact: true })).toBeVisible();
  await window.getByLabel('Monto de prueba').fill('100,50');
  await expect(window.getByLabel('Monto de prueba')).toHaveAttribute('aria-invalid', 'true');
  await expect(window.getByText('Usa punto y dos decimales, por ejemplo 100.50.')).toBeVisible();
  await reviewDraft(window);
  await expect(window.getByLabel('Monto de prueba')).toBeFocused();
  await window.getByLabel('Monto de prueba').fill('100.50');
  await expect(window.getByLabel('Monto de prueba')).toHaveAttribute('aria-invalid', 'false');
  await reviewDraft(window);
  const summary = window.getByRole('region', { name: 'Contexto revisado' });
  await expect(summary).toContainText('012000');
  await expect(summary).toContainText('100.50');
  await expect(summary).toContainText('ATM de plantillas · versión 1 · borrador');
  await summary.getByText('Ver revisión detallada', { exact: true }).click();
  await summary.getByText('Referencia de revisión').click();
  await expect(summary.locator('code')).toHaveText(/^[0-9a-f-]{36}$/);
  await window.getByRole('button', { name: 'Configurar envío', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible();
  await window.getByRole('button', { name: 'Transacciones', exact: false }).click();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await expect(summary).toBeVisible();
  await window.getByLabel('Monto de prueba').fill('120.00');
  await expect(summary).toHaveCount(0);
  await reviewDraft(window);
  await expect(summary).toContainText('120.00');
  await summary.scrollIntoViewIfNeeded();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/transaction-review-summary.png' });
  await openComposerOptions(window);
  await window.getByRole('button', { name: 'Limpiar borrador' }).click();
  await window.getByRole('dialog').getByRole('button', { name: 'Confirmar limpieza' }).click();
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue('BALANCE');
  await expect(window.getByLabel('Escenario', { exact: true })).toHaveValue('LOCAL');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(summary).toHaveCount(0);
  await window.getByLabel('Transacción', { exact: true }).selectOption('REVERSAL');
  await openPreparationDetails(window);
  await expect(
    window.getByText('Retiro original y evento de tarjeta retenida', { exact: true }),
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
    .selectOption({ label: 'ATM para Mediator' });
  await reviewDraft(window);
  const compatibility = window.getByRole('region', { name: 'Compatibilidad del destino' });
  await expect(compatibility).toContainText('Esquema Mediator PREPROD');
  await expect(compatibility).toContainText('Terminal ID · Incompatible');
  await expect(compatibility).toContainText('13 bytes ASCII; Mediator admite 10. No se trunca.');
  await expect(compatibility).toContainText('Entidad, canal y terminal · Pendiente');
  await expect(window.getByRole('button', { name: 'Ejecutar Transacción' })).toBeDisabled();
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
  await reviewDraft(window);
  await expect(compatibility).toContainText('Terminal ID · Longitud compatible');
  await window.getByLabel('Ambiente', { exact: true }).selectOption('QA');
  await reviewDraft(window);
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
  await window
    .getByRole('dialog')
    .getByRole('button', { name: 'Descartar y recargar', exact: true })
    .click();
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
  await expect(
    window.getByRole('button', { name: 'Nueva transacción', exact: true }),
  ).toBeDisabled();
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await openComposerOptions(window);
  await expect(window.getByRole('button', { name: 'Revisar transacción' })).toBeDisabled();
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
    await expect(window.locator('.sidebar-station')).toContainText('Estación QA');
    await window.reload();
    await expect(window.locator('.sidebar-station')).toContainText('Estación QA');
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

test('mejoras UI: configuración rápida conserva datos y selecciona el ATM creado', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Nueva transacción', exact: true }).click();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await openComposerOptions(window);
  await window.getByLabel('Escenario', { exact: true }).selectOption('BANRED');
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
  await window.getByLabel('Monto de prueba').fill('100.50');
  await window.getByRole('button', { name: 'Crear entidad', exact: true }).click();
  await expect(window.getByLabel('Código de entidad')).toBeVisible();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await expect(window.getByRole('button', { name: 'Inicio', exact: true })).toBeDisabled();
  await window.getByLabel('Código de entidad').fill('CANCELLED');
  await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(
    window.getByRole('heading', { name: 'Nueva transacción', exact: true }),
  ).toBeVisible();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await window.getByRole('button', { name: 'Crear entidad', exact: true }).click();
  await window.getByLabel('Código de entidad').fill('TEST-QUICK');
  await window.getByLabel('Nombre de entidad').fill('Entidad sintética rápida');
  await window.getByLabel('Red de entidad').selectOption('COONECTA');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(
    window.getByRole('heading', { name: 'Crear perfil ATM', exact: true }),
  ).toBeVisible();
  const entityId = await window.getByLabel('Entidad del ATM').inputValue();
  expect(entityId).toMatch(/^[0-9a-f-]{36}$/);
  await expect(window.getByLabel('Entidad del ATM').locator('option:checked')).toHaveText(
    'TEST-QUICK · Entidad sintética rápida',
  );
  await window.getByLabel('Alias ATM').fill('0000 0000 0000 0000');
  await expect(window.getByLabel('Alias ATM')).toHaveValue('');
  await expect(window.getByRole('alert')).toContainText('No incluyas datos de tarjeta');
  await window.getByLabel('Alias ATM').fill('ATM sintético rápido');
  await window.getByLabel('Terminal ID', { exact: true }).fill('TEST-QUICK-TERM');
  await window.getByLabel('Acquirer ID', { exact: true }).fill('TEST-QUICK-ACQ');
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/quick-atm-setup.png', scale: 'css' });
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(
    window.getByRole('heading', { name: 'Nueva transacción', exact: true }),
  ).toBeVisible();
  await expect(
    window.getByLabel('Perfil ATM', { exact: true }).locator('option:checked'),
  ).toHaveText('ATM sintético rápido');
  expect(await window.getByLabel('Perfil ATM', { exact: true }).inputValue()).toMatch(
    /^[0-9a-f-]{36}$/,
  );
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue(
    'WITHDRAWAL_APPROVED',
  );
  await expect(window.getByLabel('Escenario', { exact: true })).toHaveValue('BANRED');
  await expect(window.getByRole('combobox', { name: 'Cuenta', exact: true })).toHaveValue(
    'CURRENT',
  );
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await expect(window.getByRole('heading', { name: 'Tarjeta', exact: true })).toBeVisible();
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
});

test('mejoras UI: fallo del catálogo no pierde el borrador ni selecciona un ATM', async () => {
  const window = await launch();
  await createTestEntity(window);
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('catalog:atm:save');
    ipcMain.handle('catalog:atm:save', () => ({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Catálogo temporalmente no disponible.' },
    }));
  });
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByLabel('Monto de prueba').fill('50.00');
  await window.getByRole('button', { name: 'Crear ATM', exact: true }).click();
  await window.getByLabel('Alias ATM').fill('ATM sintético fallido');
  await window
    .getByLabel('Entidad del ATM')
    .selectOption({ label: 'TEST-E2E · Entidad sintética E2E' });
  await window.getByLabel('Terminal ID', { exact: true }).fill('TEST-FAIL-TERM');
  await window.getByLabel('Acquirer ID', { exact: true }).fill('TEST-FAIL-ACQ');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(window.getByRole('alert')).toContainText('Catálogo temporalmente no disponible.');
  await expect(window.getByLabel('Alias ATM')).toHaveValue('ATM sintético fallido');
  await expect(
    window.getByRole('button', { name: 'Guardar borrador', exact: true }),
  ).toBeDisabled();
  await window.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('50.00');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
});

test('mejoras UI: limpiar requiere confirmación y conserva los casos guardados', async () => {
  const window = await launch();
  await installTransactionReader();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de limpieza');
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window.getByLabel('Perfil ATM', { exact: true }).selectOption({ label: 'ATM de limpieza' });
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByLabel('Monto de prueba').fill('25.00');
  await window.getByRole('button', { name: 'Guardar como caso', exact: true }).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByLabel('Nombre del caso').fill('Caso de limpieza sintético');
  await dialog.getByRole('button', { name: 'Guardar caso', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeVisible();
  await reviewDraft(window);
  const summary = window.getByLabel('Contexto revisado', { exact: true });
  await expect(summary).toBeVisible();
  await openComposerOptions(window);
  await window.getByRole('button', { name: 'Limpiar borrador', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: '¿Limpiar este borrador?', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Conservar borrador', exact: true }),
  ).toBeFocused();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/discard-draft-confirmation.png', scale: 'css' });
  await dialog.getByRole('button', { name: 'Conservar borrador', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(summary).toBeVisible();
  await expect(window.getByLabel('Resumen de la transacción')).toContainText(
    transactionIdentity.panMasked!,
  );
  await openComposerOptions(window);
  await window.getByRole('button', { name: 'Limpiar borrador', exact: true }).click();
  await window.keyboard.press('Escape');
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('25.00');
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeEnabled();
  await openComposerOptions(window);
  await window.getByRole('button', { name: 'Limpiar borrador', exact: true }).click();
  await dialog.getByRole('button', { name: 'Confirmar limpieza', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(window.getByLabel('Transacción', { exact: true })).toHaveValue('BALANCE');
  await expect(window.getByLabel('Perfil ATM', { exact: true })).toHaveValue('');
  await expect(summary).toHaveCount(0);
  await expect(window.getByLabel('Resumen de la transacción')).toContainText(
    'Pendiente de seleccionar',
  );
  await window.getByRole('button', { name: 'Casos guardados (1)', exact: true }).click();
  await expect(dialog.getByText('Caso de limpieza sintético', { exact: true })).toBeVisible();
});

test('mejoras UI: buscar y filtrar casos conserva controles de vigencia y errores', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM para filtros');
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM para filtros' });
  const saveCase = async (name: string) => {
    await window.getByRole('button', { name: 'Guardar como caso', exact: true }).click();
    await window.getByRole('dialog').getByLabel('Nombre del caso').fill(name);
    await window
      .getByRole('dialog')
      .getByRole('button', { name: 'Guardar caso', exact: true })
      .click();
    await expect(window.getByRole('dialog')).not.toBeVisible();
  };
  await saveCase('Consulta sintética central');
  await window.getByLabel('Transacción', { exact: true }).selectOption('WITHDRAWAL_APPROVED');
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).selectOption('CURRENT');
  await window.getByLabel('Monto de prueba').fill('100.50');
  await saveCase('Retiro sintético corriente');
  await window.getByRole('button', { name: 'Casos guardados (2)', exact: true }).click();
  const dialog = window.getByRole('dialog');
  await expect(dialog.locator('.saved-case-list > li')).toHaveCount(2);
  await dialog.getByLabel('Buscar caso').fill('CONSULTA SINTETICA');
  await expect(dialog.locator('.saved-case-list > li')).toHaveCount(1);
  await expect(dialog.locator('.case-filter-count')).toContainText('1 de 2 casos');
  await dialog.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await dialog.getByLabel('Operación del caso').selectOption('WITHDRAWAL_APPROVED');
  await dialog.getByLabel('Buscar caso').fill('100.50');
  await expect(dialog.locator('.saved-case-list > li')).toHaveCount(1);
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1024, 768),
  );
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/filtered-cases.png', scale: 'css' });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByLabel('Perfil ATM del caso').selectOption('STALE');
  await expect(dialog.getByRole('heading', { name: 'Sin casos para estos filtros' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Mostrar todos los casos', exact: true }).click();
  await dialog.getByLabel('Buscar caso').fill('0000 0000 0000 0000');
  await expect(dialog.getByLabel('Buscar caso')).toHaveValue('');
  await expect(dialog.getByRole('alert')).toContainText('No incluyas datos de tarjeta');
  await dialog.getByLabel('Buscar caso').fill('Retiro');
  await dialog
    .getByRole('button', { name: 'Cargar Retiro sintético corriente', exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await expect(window.getByLabel('Monto de prueba')).toHaveValue('100.50');
  await window.getByRole('button', { name: 'Perfiles ATM', exact: true }).click();
  await window.getByRole('button', { name: 'Editar ATM para filtros', exact: true }).click();
  await window.getByLabel('Alias ATM').fill('ATM para filtros actualizado');
  await window.getByRole('button', { name: 'Guardar borrador', exact: true }).click();
  await expect(
    window.getByRole('button', { name: 'Editar ATM para filtros actualizado', exact: true }),
  ).toBeVisible();
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window.getByRole('button', { name: 'Casos guardados (2)', exact: true }).click();
  await dialog.getByLabel('Perfil ATM del caso').selectOption('STALE');
  await expect(dialog.locator('.saved-case-list > li')).toHaveCount(2);
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('catalog:list');
    ipcMain.handle('catalog:list', () => ({
      ok: false,
      error: { code: 'TIMEOUT', message: 'El catálogo no respondió a tiempo.' },
    }));
  });
  await dialog.getByRole('button', { name: 'Recargar casos', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('El catálogo no respondió a tiempo.');
  await dialog.getByLabel('Buscar caso').fill('Retiro');
  await expect(dialog.getByRole('alert')).toContainText('El catálogo no respondió a tiempo.');
  await expect(
    dialog.getByRole('button', { name: 'Cargar Retiro sintético corriente', exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole('button', { name: 'Eliminar caso Retiro sintético corriente', exact: true }),
  ).toBeDisabled();
});

test('caso QA permite guardar y editar expectativa sin ejecutar una transacción', async () => {
  const window = await launch();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM para expectativa');
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM para expectativa' });
  await window.getByRole('button', { name: 'Guardar como caso', exact: true }).click();
  const dialog = window.getByRole('dialog');
  await dialog.getByLabel('Nombre del caso').fill('Saldo QA esperado');
  await dialog.getByLabel('Resultado esperado del host').selectOption('APPROVED');
  await dialog.getByLabel('Código de respuesta esperado (opcional)').fill('00');
  await dialog.getByLabel('Fuente de la expectativa').fill('docs/transactions/BALANCE_INQUIRY.md');
  await dialog.getByRole('button', { name: 'Guardar caso', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await window.getByRole('button', { name: 'Casos guardados (1)', exact: true }).click();
  await expect(dialog.getByText('Esperado: Aprobado · RC 00')).toBeVisible();
  await dialog.getByRole('button', { name: 'Editar expectativa de Saldo QA esperado' }).click();
  await dialog.getByLabel('Resultado esperado del host').selectOption('NOT_APPROVED');
  await dialog.getByLabel('Código de respuesta esperado (opcional)').fill('05');
  await dialog.getByRole('button', { name: 'Guardar expectativa', exact: true }).click();
  await window.getByRole('button', { name: 'Casos guardados (1)', exact: true }).click();
  await expect(dialog.getByText('Esperado: No aprobado · RC 05')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cargar Saldo QA esperado' }).click();
  await expect(window.getByText(/Caso cargado: «Saldo QA esperado»/)).toBeVisible();
  await expect(window.getByLabel('Resultado')).toContainText('Aún no hay resultado');
});

test('mejoras UI: revisión ocupada mantiene el ambiente bloqueado al salir del lector', async () => {
  const window = await launch();
  await installTransactionReader();
  await createTestEntity(window);
  await createTestAtm(window, 'ATM de revisión pendiente');
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await window
    .getByLabel('Perfil ATM', { exact: true })
    .selectOption({ label: 'ATM de revisión pendiente' });
  await app!.evaluate(({ ipcMain }) => {
    const state = globalThis as typeof globalThis & { finishUiReview?: () => void };
    ipcMain.removeHandler('transaction:draft:review');
    ipcMain.handle(
      'transaction:draft:review',
      () =>
        new Promise((resolve) => {
          state.finishUiReview = () =>
            resolve({
              ok: false,
              error: {
                code: 'SERVICE_UNAVAILABLE',
                message: 'Dependencia de revisión no disponible.',
              },
            });
        }),
    );
  });
  await reviewDraft(window);
  await expect(window.getByRole('button', { name: 'Revisando…', exact: true })).toBeDisabled();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await window.getByRole('button', { name: 'Historial', exact: true }).click();
  await expect(window.getByRole('heading', { name: 'Historial', exact: true })).toBeVisible();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await app!.evaluate(() => {
    const state = globalThis as typeof globalThis & { finishUiReview?: () => void };
    state.finishUiReview?.();
    delete state.finishUiReview;
  });
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeEnabled();
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await expect(window.getByRole('alert')).toContainText('Dependencia de revisión no disponible.');
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
});

test('pulido UI: recargar protege la edición, permite cancelar y recupera un timeout', async () => {
  const window = await launch();
  await createTestEntity(window);
  await window.getByRole('button', { name: 'Editar TEST-E2E', exact: true }).click();
  await expect(window.getByLabel('Buscar entidad')).not.toBeVisible();
  await expect(
    window.getByRole('heading', { name: 'Actividad del catálogo', exact: true }),
  ).not.toBeVisible();
  await window.getByLabel('Nombre de entidad').fill('Edición sintética temporal');
  await app!.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.setContentSize(1024, 768),
  );
  await expect(
    window.getByRole('button', { name: 'Guardar borrador', exact: true }),
  ).toBeInViewport();
  await mkdir('artifacts', { recursive: true });
  await window.screenshot({ path: 'artifacts/focused-catalog-editor.png', scale: 'css' });
  await window.getByRole('button', { name: 'Recargar', exact: true }).click();
  const dialog = window.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: '¿Descartar cambios y recargar?', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Seguir editando', exact: true })).toBeFocused();
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Seguir editando', exact: true }).click();
  await expect(window.getByLabel('Nombre de entidad')).toHaveValue('Edición sintética temporal');
  await window.getByRole('button', { name: 'Recargar', exact: true }).click();
  await window.keyboard.press('Escape');
  await expect(window.getByLabel('Nombre de entidad')).toHaveValue('Edición sintética temporal');
  await window.getByRole('button', { name: 'Recargar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Descartar y recargar', exact: true }).click();
  await expect(
    window.getByRole('cell', { name: 'Entidad sintética E2E', exact: true }),
  ).toBeVisible();
  await expect(window.getByLabel('Nombre de entidad')).not.toBeVisible();
  await window.getByRole('button', { name: 'Editar TEST-E2E', exact: true }).click();
  await window.getByLabel('Nombre de entidad').fill('Cambio revertido');
  await window.getByLabel('Nombre de entidad').fill('Entidad sintética E2E');
  await window.getByRole('button', { name: 'Recargar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(window.getByRole('button', { name: 'Editar TEST-E2E', exact: true })).toBeVisible();
  const catalog = await window.evaluate(() => globalThis.window.desktop!.getCatalog('QA'));
  expect(catalog.ok).toBe(true);
  await app!.evaluate(({ ipcMain }, response) => {
    let fail = true;
    ipcMain.removeHandler('catalog:list');
    ipcMain.handle('catalog:list', () => {
      if (!fail) return response;
      fail = false;
      return {
        ok: false,
        error: { code: 'TIMEOUT', message: 'El catálogo no respondió a tiempo.' },
      };
    });
  }, catalog);
  await window.getByRole('button', { name: 'Editar TEST-E2E', exact: true }).click();
  await window.getByLabel('Nombre de entidad').fill('Cambio que se descarta');
  await window.getByRole('button', { name: 'Recargar', exact: true }).click();
  await dialog.getByRole('button', { name: 'Descartar y recargar', exact: true }).click();
  await expect(window.getByRole('alert')).toContainText('El catálogo no respondió a tiempo.');
  await expect(window.getByLabel('Nombre de entidad')).not.toBeVisible();
  await window.getByRole('button', { name: 'Recargar', exact: true }).click();
  await expect(
    window.getByRole('cell', { name: 'Entidad sintética E2E', exact: true }),
  ).toBeVisible();
  await expect(window.getByRole('alert')).toHaveCount(0);
});

test('pulido UI: las aplicaciones pertenecen al lector seleccionado y la carga tiene estados claros', async () => {
  const window = await launch();
  const otherReader = 'Synthetic second contact';
  const applicationId = 'A0000000031010';
  await app!.evaluate(
    ({ ipcMain }, args) => {
      let current: CardIdentityReading | null = null;
      ipcMain.removeHandler('reader:inspect');
      ipcMain.handle('reader:inspect', () => ({
        ok: true,
        value: {
          checkedAt: args.identity.readAt,
          identityStatus: current?.status === 'READ' ? 'READ' : 'NOT_READ',
          readers: [
            { name: args.identity.readerName, state: 'CARD_PRESENT', atr: '3B00' },
            { name: args.otherReader, state: 'CARD_PRESENT', atr: '3B00' },
          ],
          identity: current,
        },
      }));
      ipcMain.removeHandler('reader:identity:read');
      ipcMain.handle('reader:identity:read', (_event, request) => {
        if (request.readerName === args.otherReader && request.applicationId)
          return {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'La aplicación pertenece a otra interfaz.',
            },
          };
        current =
          request.readerName === args.identity.readerName && !request.applicationId
            ? {
                ...args.identity,
                status: 'SELECT_APPLICATION',
                applicationLabel: null,
                panMasked: null,
                cardholderName: null,
                expiry: null,
                applications: [{ id: args.applicationId, label: 'Aplicación sintética' }],
              }
            : { ...args.identity, readerName: request.readerName };
        return { ok: true, value: current };
      });
    },
    { identity: transactionIdentity, otherReader, applicationId },
  );
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.locator('.transaction-card-status')).toContainText(
    'Selecciona una aplicación',
  );
  const choice = picker.getByRole('button', {
    name: 'Aplicación sintética · ' + applicationId,
    exact: true,
  });
  await choice.click();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeEnabled();
  await picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true }).click();
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(choice).toBeVisible();
  await picker.getByLabel('Lector para la transacción').selectOption(otherReader);
  await expect(choice).not.toBeVisible();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeEnabled();
  await expect(picker.getByRole('alert')).toHaveCount(0);
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => ({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE', message: 'El lector no está disponible.' },
    }));
  });
  await picker.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await expect(picker.locator('.transaction-card-status')).toContainText('Lector no disponible');
  await expect(picker.locator('.transaction-card-status')).not.toContainText('Inserta una tarjeta');
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
});

test('lector por eventos: inserción y retiro actualizan la UI sin búsquedas ni lecturas automáticas', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await window.clock.install();
  try {
    await app!.evaluate(({ ipcMain }) => {
      const state = globalThis as typeof globalThis & {
        eventReaderChecks?: number;
        eventCardReads?: number;
      };
      state.eventReaderChecks = 0;
      state.eventCardReads = 0;
      ipcMain.removeHandler('reader:inspect');
      ipcMain.handle('reader:inspect', () => {
        state.eventReaderChecks!++;
        return {
          ok: true,
          value: { checkedAt: '2026-10-15T14:00:00Z', identityStatus: 'NOT_READ', readers: [] },
        };
      });
      ipcMain.removeHandler('reader:identity:read');
      ipcMain.handle('reader:identity:read', () => {
        state.eventCardReads!++;
        return { ok: false };
      });
    });
    await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
    const picker = window.getByLabel('Elegir tarjeta', { exact: true });
    await expect(picker.locator('.transaction-card-status')).toContainText(
      'Sin lectores conectados',
    );
    await window.clock.fastForward(60000);
    for (const present of [true, false, true]) {
      await app!.evaluate(({ BrowserWindow }, present) => {
        BrowserWindow.getAllWindows()[0]!.webContents.send('reader:changed', {
          ok: true,
          value: {
            checkedAt: '2026-10-15T14:01:00Z',
            identityStatus: 'NOT_READ',
            readers: [
              {
                name: 'CI Reader',
                state: present ? 'CARD_PRESENT' : 'EMPTY',
                atr: present ? '3B00' : null,
              },
            ],
          },
        });
      }, present);
      await expect(picker.locator('.transaction-card-status')).toContainText(
        present ? 'Tarjeta detectada' : 'Inserta una tarjeta',
      );
    }
    expect(
      await app!.evaluate(() => {
        const state = globalThis as typeof globalThis & {
          eventReaderChecks?: number;
          eventCardReads?: number;
        };
        return [state.eventReaderChecks, state.eventCardReads];
      }),
    ).toEqual([1, 0]);
  } finally {
    await window.clock.resume();
  }
});

for (const pollingResult of ['present', 'removed', 'error', 'timeout'] as const) {
  test(`lectura en cola: espera la búsqueda manual y valida ${pollingResult}`, async () => {
    const window = await launch();
    await window.getByRole('button', { name: 'Configuración', exact: true }).click();
    await window.clock.install();
    try {
      await app!.evaluate(
        ({ ipcMain }, args) => {
          const state = globalThis as typeof globalThis & {
            queuedReads?: number;
            finishQueuedPolling?: () => void;
          };
          state.queuedReads = 0;
          let checks = 0;
          const snapshot = {
            checkedAt: args.identity.readAt,
            identityStatus: 'NOT_READ',
            readers: [{ name: args.identity.readerName, state: 'CARD_PRESENT', atr: '3B00' }],
          };
          ipcMain.removeHandler('reader:inspect');
          ipcMain.handle('reader:inspect', () => {
            if (++checks === 1) return { ok: true, value: snapshot };
            return new Promise((resolveResult) => {
              state.finishQueuedPolling = () =>
                resolveResult(
                  args.outcome === 'error'
                    ? {
                        ok: false,
                        error: {
                          code: 'SERVICE_UNAVAILABLE',
                          message: 'Dependencia de lector no disponible.',
                        },
                      }
                    : {
                        ok: true,
                        value: {
                          ...snapshot,
                          readers: [
                            {
                              name: args.identity.readerName,
                              state: args.outcome === 'removed' ? 'EMPTY' : 'CARD_PRESENT',
                              atr: args.outcome === 'removed' ? null : '3B00',
                            },
                          ],
                        },
                      },
                );
            });
          });
          ipcMain.removeHandler('reader:identity:read');
          ipcMain.handle('reader:identity:read', () => {
            state.queuedReads = (state.queuedReads ?? 0) + 1;
            return { ok: true, value: args.identity };
          });
        },
        { identity: transactionIdentity, outcome: pollingResult },
      );
      await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
      const picker = window.getByLabel('Elegir tarjeta', { exact: true });
      await expect(picker.getByRole('button', { name: 'Leer tarjeta', exact: true })).toBeEnabled();
      await picker.getByRole('button', { name: 'Buscar lector', exact: true }).click();
      await expect(picker.locator('.transaction-card-status')).toContainText('Consultando estado');
      await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
      await expect(
        picker.getByRole('button', { name: 'Leyendo tarjeta…', exact: true }),
      ).toBeDisabled();
      expect(
        await app!.evaluate(
          () => (globalThis as typeof globalThis & { queuedReads?: number }).queuedReads,
        ),
      ).toBe(0);
      if (pollingResult === 'timeout') await window.clock.fastForward(11000);
      else
        await app!.evaluate(() => {
          (
            globalThis as typeof globalThis & { finishQueuedPolling?: () => void }
          ).finishQueuedPolling?.();
        });
      if (pollingResult === 'present') {
        await expect(
          picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true }),
        ).toBeEnabled();
        expect(
          await app!.evaluate(
            () => (globalThis as typeof globalThis & { queuedReads?: number }).queuedReads,
          ),
        ).toBe(1);
      } else {
        if (pollingResult === 'removed')
          await expect(picker.locator('.transaction-card-status')).toContainText(
            'Inserta una tarjeta',
          );
        else await expect(picker.getByRole('alert').first()).toBeVisible();
        await expect(
          picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true }),
        ).toHaveCount(0);
        expect(
          await app!.evaluate(
            () => (globalThis as typeof globalThis & { queuedReads?: number }).queuedReads,
          ),
        ).toBe(0);
      }
      await expect(window.getByLabel('Ambiente', { exact: true })).toBeEnabled();
    } finally {
      await window.clock.resume();
    }
  });
}

test('lector por eventos: no consulta periódicamente durante ni después de leer', async () => {
  const window = await launch();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  await window.clock.install();
  try {
    await app!.evaluate(({ ipcMain }, identity) => {
      const state = globalThis as typeof globalThis & {
        uiReaderChecks?: number;
        finishUiCardRead?: () => void;
      };
      state.uiReaderChecks = 0;
      let current: typeof identity | null = null;
      ipcMain.removeHandler('reader:inspect');
      ipcMain.handle('reader:inspect', () => {
        state.uiReaderChecks = (state.uiReaderChecks ?? 0) + 1;
        return {
          ok: true,
          value: {
            checkedAt: identity.readAt,
            identityStatus: current ? 'READ' : 'NOT_READ',
            readers: [{ name: identity.readerName, state: 'CARD_PRESENT', atr: '3B00' }],
            identity: current,
          },
        };
      });
      ipcMain.removeHandler('reader:identity:read');
      ipcMain.handle(
        'reader:identity:read',
        () =>
          new Promise((resolve) => {
            state.finishUiCardRead = () => {
              current = identity;
              resolve({ ok: true, value: identity });
            };
          }),
      );
    }, transactionIdentity);
    await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
    const picker = window.getByLabel('Elegir tarjeta', { exact: true });
    await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
    await expect(
      picker.getByRole('button', { name: 'Leyendo tarjeta…', exact: true }),
    ).toBeDisabled();
    await expect(picker.locator('.transaction-card-status')).toContainText('Leyendo tarjeta…');
    await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
    const checks = await app!.evaluate(
      () => (globalThis as typeof globalThis & { uiReaderChecks?: number }).uiReaderChecks,
    );
    await window.clock.fastForward(6000);
    await window.clock.fastForward(6000);
    expect(
      await app!.evaluate(
        () => (globalThis as typeof globalThis & { uiReaderChecks?: number }).uiReaderChecks,
      ),
    ).toBe(checks);
    await app!.evaluate(() => {
      const state = globalThis as typeof globalThis & { finishUiCardRead?: () => void };
      state.finishUiCardRead?.();
      delete state.finishUiCardRead;
    });
    await expect(
      picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true }),
    ).toBeEnabled();
    await window.clock.fastForward(6000);
    expect(
      await app!.evaluate(
        () => (globalThis as typeof globalThis & { uiReaderChecks?: number }).uiReaderChecks,
      ),
    ).toBe(checks);
    await expect(
      picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true }),
    ).toBeEnabled();
    await expect(window.getByLabel('Ambiente', { exact: true })).toBeEnabled();
  } finally {
    await window.clock.resume();
  }
});

test('configuración de envío offline guarda ajustes y prepara sin tramas ni transmisión', async () => {
  const evidence = networkEvidence();
  await writeFile(join(directory, 'network-evidence.json'), JSON.stringify(evidence));
  const window = await launch();
  await window.getByRole('button', { name: 'Configuración', exact: true }).click();
  const settings = window.getByRole('region', { name: 'Configuración de envío', exact: true });
  await expect(
    settings.getByText(evidence.ingress.host + ':' + evidence.ingress.port, { exact: true }),
  ).toBeVisible();
  await expect(settings.getByLabel('Modo previsto')).toHaveValue('ON_CLICK');
  await expect(settings.getByLabel('Espera de conexión (ms)')).toHaveValue('');
  await settings.getByLabel('Espera de conexión (ms)').fill('0');
  await settings
    .getByRole('button', { name: 'Guardar configuración de envío', exact: true })
    .click();
  await expect(settings.getByRole('alert')).toContainText('entre 1 y 30000');
  await expect(window.getByLabel('Ambiente', { exact: true })).toBeDisabled();
  await settings.getByLabel('Espera de conexión (ms)').fill('1000');
  await settings.getByLabel('Ventana de respuesta (ms)').fill('2000');
  await settings.getByLabel('Modo previsto').selectOption('AFTER_REVIEW');
  await settings
    .getByRole('button', { name: 'Guardar configuración de envío', exact: true })
    .click();
  await expect(settings.getByRole('status')).toContainText('No se ha abierto ninguna conexión.');
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  await reviewDraft(window);
  await expect(
    window.getByRole('region', { name: 'Contexto revisado', exact: true }),
  ).toBeVisible();
  const plan = window.getByLabel('Plan de envío', { exact: true });
  await expect(plan).toContainText('Configuración de envío');
  await expect(plan).toContainText('Después de revisar');
  await expect(plan).toContainText('Plan documental · sin transmisión.');
  await expect(
    window.getByRole('button', { name: 'Ejecutar Transacción', exact: true }),
  ).toBeDisabled();
  const api = await window.evaluate(() => ({
    senderExposed: 'sendTransaction' in globalThis.window.desktop!,
    nodeExposed: 'require' in globalThis.window,
  }));
  expect(api).toEqual({ senderExposed: false, nodeExposed: false });
  const configuration = JSON.parse(
    await readFile(join(directory, 'send-configuration.json'), 'utf8'),
  ) as { configurations: { revision: number }[]; audit: unknown[] };
  expect(configuration.configurations[0]?.revision).toBe(2);
  expect(configuration.audit).toHaveLength(2);
});

test('bugs tarjeta: errores por interfaz y selección estable tras desconexión', async () => {
  const window = await launch();
  const devices: CardReaderSnapshot['readers'] = [
    { name: 'Synthetic Preferred', state: 'CARD_PRESENT', atr: '3B00' },
    { name: 'Synthetic Backup', state: 'CARD_PRESENT', atr: '3B00' },
  ];
  const setDevices = async (readers: CardReaderSnapshot['readers']) => {
    await app!.evaluate(({ ipcMain }, list) => {
      ipcMain.removeHandler('reader:inspect');
      ipcMain.handle('reader:inspect', () => ({
        ok: true,
        value: {
          checkedAt: '2026-10-11T23:00:00.000Z',
          readers: list,
          identityStatus: 'NOT_READ',
          identity: null,
        },
      }));
    }, readers);
  };
  await setDevices(devices);
  await app!.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('reader:identity:read');
    ipcMain.handle('reader:identity:read', () => ({
      ok: false,
      error: { code: 'TIMEOUT', message: 'La lectura sintética no respondió.' },
    }));
  });
  await window.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  const panel = window.getByRole('region', { name: 'Estado del lector' });
  const selector = panel.getByLabel('Lector', { exact: true });
  await selector.selectOption('Synthetic Preferred');
  await panel.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('La lectura sintética no respondió.');
  await expect(panel.getByRole('button', { name: 'Actualizar', exact: true })).toBeEnabled();
  await selector.selectOption('Synthetic Backup');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await selector.selectOption('Synthetic Preferred');
  await setDevices([devices[1]!]);
  await panel.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(selector).toHaveValue('Synthetic Backup');
  await setDevices(devices);
  await panel.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(selector).toHaveValue('Synthetic Backup');
  await window.getByLabel('Ambiente', { exact: true }).selectOption('PREPROD');
  await expect(
    window.getByText('El guardado está disponible solo en QA.', { exact: true }),
  ).toBeVisible();
});

test('bugs tarjeta: rechaza una identidad de otro lector y actualiza el retiro después del fallo', async () => {
  const window = await launch();
  await app!.evaluate(({ ipcMain }, identity) => {
    let present = true;
    const current: typeof identity | null = null;
    let reads = 0;
    ipcMain.removeHandler('reader:inspect');
    ipcMain.handle('reader:inspect', () => ({
      ok: true,
      value: {
        checkedAt: identity.readAt,
        readers: [
          {
            name: identity.readerName,
            state: present ? 'CARD_PRESENT' : 'EMPTY',
            atr: present ? '3B00' : null,
          },
        ],
        identityStatus: current ? 'READ' : 'NOT_READ',
        identity: current,
      },
    }));
    ipcMain.removeHandler('reader:identity:read');
    ipcMain.handle('reader:identity:read', () => {
      reads++;
      if (reads === 1)
        return { ok: true, value: { ...identity, readerName: 'Other synthetic reader' } };
      present = false;
      return { ok: false, error: { code: 'NOT_FOUND', message: 'La tarjeta se retiró.' } };
    });
  }, transactionIdentity);
  await window.getByRole('button', { name: 'Transacciones', exact: true }).click();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('alert')).toContainText(
    'La lectura no corresponde al lector seleccionado.',
  );
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
  await expect(picker).not.toContainText(transactionIdentity.panMasked!);
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.locator('.transaction-card-status')).toContainText(
    'Inserta una tarjeta por contacto',
  );
  await expect(picker.getByRole('button', { name: 'Leer tarjeta', exact: true })).toBeDisabled();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
  await installTransactionReader();
  await picker.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(picker.getByRole('alert')).toHaveCount(0);
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toBeVisible();
  await expect(window.getByLabel('Resumen de la transacción')).toContainText(
    transactionIdentity.panMasked!,
  );
});

test('selección directa: cambiar tarjeta no la vuelve a seleccionar al actualizar', async () => {
  const window = await prepareBalanceSubmission();
  const picker = window.getByLabel('Elegir tarjeta', { exact: true });
  const send = window.getByRole('button', { name: 'Ejecutar Transacción', exact: true });
  await picker.getByRole('button', { name: 'Leer tarjeta', exact: true }).click();
  await expect(send).toBeEnabled();
  await picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true }).click();
  await expect(send).toBeDisabled();
  await picker.getByRole('button', { name: 'Buscar lector', exact: true }).click();
  await expect(picker.getByRole('button', { name: 'Buscar lector', exact: true })).toBeEnabled();
  await expect(picker.getByRole('button', { name: 'Cambiar tarjeta', exact: true })).toHaveCount(0);
  await expect(send).toBeDisabled();
  await picker.getByRole('button', { name: 'Seleccionar tarjeta leída', exact: true }).click();
  await expect(send).toBeEnabled();
  await window.getByRole('combobox', { name: 'Cuenta', exact: true }).focus();
  await window.keyboard.press('ArrowDown');
  await expect(window.getByRole('combobox', { name: 'Cuenta', exact: true })).toHaveValue(
    'CURRENT',
  );
  await expect(send).toBeDisabled();
  await window.keyboard.press('ArrowUp');
  await expect(window.getByRole('combobox', { name: 'Cuenta', exact: true })).toHaveValue(
    'SAVINGS',
  );
  await expect(send).toBeEnabled();
  await expect(window.getByRole('heading', { name: 'Aún no hay resultado' })).toBeVisible();
});
