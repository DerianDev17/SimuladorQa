import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { channels, desktopEvents, failure } from '../../../../packages/shared/src/contracts';
import type { Result } from '../../../../packages/shared/src/contracts';
import type {
  CardReaderMonitor,
  CardReaderSnapshot,
} from '../../../../packages/domain/src/card-reader';
import { DesktopApplication } from './application';
import { FilePreferencesStore } from './infrastructure/preferences-store';
import { isTrustedSender } from './security';
import { WorkerCatalogStore } from './infrastructure/worker-catalog-store';
import { CmsV36Catalog } from './adapters/cms-v36-catalog';
import { MediatorSchemaInspector } from './adapters/mediator-schema-inspector';
import { CapturedEvidenceCatalog } from './adapters/captured-evidence-catalog';
import { MediatorObserver } from './adapters/mediator-observer';
import { FileSendConfigurationStore } from './infrastructure/send-configuration-store';
import { SendConfigurationService } from './send-configuration-service';
import { BalanceInquiryService } from './balance-inquiry-service';
import { WithdrawalService } from './withdrawal-service';
import { WithdrawalReceiptService } from './withdrawal-receipt-service';
import { ElectronReceiptPrinter } from './adapters/electron-receipt-printer';
import { QaBalanceContextRouter } from './qa-balance-context-router';
import { QaBalanceExecutionProvider } from './qa-balance-execution-provider';
import { FileQaExecutionProfiles } from './infrastructure/qa-execution-profiles';
import { FileQaWithdrawalPolicies } from './infrastructure/qa-withdrawal-policies';
import { QaWithdrawalExecutionProvider } from './qa-withdrawal-execution-provider';
import {
  FileQaAtmEvidenceBindings,
  documentedQaAtmContextBinding,
} from './infrastructure/qa-atm-evidence-bindings';
import {
  FileQaCmsAtmEvidence,
  documentedCmsAtmContextBinding,
} from './infrastructure/qa-cms-atm-evidence';
import { WindowsQaPinEntry } from './adapters/qa-pin-entry';
import { WindowsQaPinCipher } from './adapters/qa-pin-cipher';
import { FileBalanceJournal } from './infrastructure/balance-journal';
import { BalanceTcpTransport } from './adapters/balance-tcp-transport';
import { WithdrawalReversalTransport } from './adapters/withdrawal-reversal-transport';
import { FileNetworkEvidence } from './adapters/file-network-evidence';
import { inspectReader } from './adapters/windows-pcsc-reader';
import { WindowsPcscMonitor } from './adapters/windows-pcsc-monitor';
import { SimulatedCardReader } from './adapters/simulated-card-reader';
import { QaSwitchConnection } from './adapters/qa-switch-connection';
import { WindowsCardSession } from './adapters/windows-card-session';
import { CardIdentityService } from './card-identity-service';

const development = process.argv.includes('--dev');
// Vite serves development assets directly; avoid reusing a corrupt HTTP disk cache.
if (development) app.commandLine.appendSwitch('disable-http-cache');
const rendererFile = join(__dirname, 'renderer', 'index.html');
const rendererUrl = development ? 'http://127.0.0.1:5173/' : pathToFileURL(rendererFile).href;
let window: BrowserWindow | null = null;
let catalogs: WorkerCatalogStore | undefined;
let observer: MediatorObserver | undefined;
let cardReader: CardReaderMonitor | undefined;
let switchConnection: QaSwitchConnection | undefined;
let cardIdentity: CardIdentityService | undefined;
let balanceService: BalanceInquiryService | undefined;
let withdrawalService: WithdrawalService | undefined;
let withdrawalReceipts: WithdrawalReceiptService | undefined;
let quitting = false;
let developmentReload = false;
let developmentReloadTimer: ReturnType<typeof setTimeout> | undefined;

function reloadDevelopmentWhenIdle(): void {
  if (!developmentReload || quitting) return;
  clearTimeout(developmentReloadTimer);
  if (
    balanceService?.isBusy() ||
    withdrawalService?.isBusy() ||
    cardIdentity?.isBusy() ||
    withdrawalReceipts?.isBusy()
  ) {
    developmentReloadTimer = setTimeout(reloadDevelopmentWhenIdle, 250);
    return;
  }
  app.quit();
}
let readerRevision = 0;

async function readerSnapshot(payload?: unknown): Promise<Result<CardReaderSnapshot>> {
  if (!cardReader) return failure('SERVICE_UNAVAILABLE', 'El lector no está configurado.');
  const result = await inspectReader(cardReader, payload);
  if (!result.ok) return result;
  const identity = (await cardIdentity?.current()) ?? null;
  return {
    ok: true,
    value: {
      ...result.value,
      identity,
      identityStatus: identity?.status === 'READ' ? 'READ' : 'NOT_READ',
    },
  };
}

async function publishReaderSnapshot(): Promise<void> {
  const revision = ++readerRevision;
  const result = await readerSnapshot();
  if (revision === readerRevision && window && !window.webContents.isDestroyed())
    window.webContents.send(desktopEvents.readerChanged, result);
}

app.setName('Coonecta ATM Simulator');
// Solo se permite redirigir datos locales al lanzar tests con una carpeta temporal explícita.
const dataArgument = process.argv.find((argument) => argument.startsWith('--user-data-dir='));
if (dataArgument) app.setPath('userData', dataArgument.slice('--user-data-dir='.length));

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1040,
    minHeight: 760,
    show: false,
    title: 'Coonecta · ATM Transaction Simulator',
    backgroundColor: '#f4f7fb',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== rendererUrl) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.once('ready-to-show', () => window?.show());
  window.on('closed', () => {
    window = null;
  });
  if (development) await window.loadURL(rendererUrl);
  else await window.loadFile(rendererFile);
}

void app
  .whenReady()
  .then(async () => {
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    session.defaultSession.setPermissionCheckHandler(() => false);
    catalogs = new WorkerCatalogStore(
      join(__dirname, 'catalog-worker.cjs'),
      join(app.getPath('userData'), 'catalogs.sqlite'),
    );
    observer = new MediatorObserver(
      join(__dirname, 'mediator-query.ps1'),
      join(app.getPath('userData'), 'mediator-observer.json'),
    );
    cardReader =
      dataArgument && process.argv.includes('--simulate-reader')
        ? new SimulatedCardReader(() => ({
            checkedAt: new Date().toISOString(),
            readers: [],
            identityStatus: 'NOT_READ',
          }))
        : new WindowsPcscMonitor(join(__dirname, 'pcsc-monitor.ps1'));
    cardIdentity = new CardIdentityService(cardReader, async (readerName) => {
      const session = new WindowsCardSession(
        join(__dirname, 'pcsc-card.ps1'),
        8000,
        process.env.SystemRoot,
        true,
      );
      try {
        await session.open(readerName);
        return session;
      } catch (error) {
        session.close();
        throw error;
      }
    });
    cardReader.subscribe((snapshot) => {
      cardIdentity?.observePresence(snapshot);
      if (snapshot) void publishReaderSnapshot();
      else {
        readerRevision++;
        if (window && !window.webContents.isDestroyed())
          window.webContents.send(
            desktopEvents.readerChanged,
            failure(
              'SERVICE_UNAVAILABLE',
              'El lector no está disponible. Se restablecerá la detección al recuperar PC/SC.',
            ),
          );
      }
    });
    const networkEvidence = await FileNetworkEvidence.load(
      join(app.getPath('userData'), 'network-evidence.json'),
    );
    const runtime = {
      agentId: randomUUID(),
      hostname: hostname(),
      user: userInfo().username,
      version: '0.1.0',
      uuid: randomUUID,
      now: () => new Date().toISOString(),
    };
    const sendConfiguration = new SendConfigurationService(
      new FileSendConfigurationStore(join(app.getPath('userData'), 'send-configuration.json')),
      networkEvidence,
      runtime,
    );
    await sendConfiguration.initializeDocumentedQa();
    const balanceContexts = new QaBalanceContextRouter();
    const withdrawalContexts = new QaBalanceContextRouter('WITHDRAWAL');
    const withdrawalPolicies = new FileQaWithdrawalPolicies(
      join(app.getPath('userData'), 'qa-withdrawal-policies.json'),
    );
    const boundAtms = new Set<string>();
    const executionProfiles = new FileQaExecutionProfiles(
      join(app.getPath('userData'), 'qa-execution-profiles.json'),
    );
    const pinEntry = new WindowsQaPinEntry(join(__dirname, 'qa-pin-entry.ps1'));
    const pinCipher = new WindowsQaPinCipher(
      join(__dirname, 'qa-pin-cipher.ps1'),
      join(app.getPath('userData'), 'qa-test-keys'),
    );
    try {
      for (const profile of (await executionProfiles.read()).profiles) {
        balanceContexts.bind({
          atmId: profile.atmId,
          atmRevision: profile.atmRevision,
          terminalId: profile.terminalId,
          endpoint: profile.endpoint,
          provider: new QaBalanceExecutionProvider(
            profile,
            executionProfiles,
            cardIdentity,
            pinEntry,
            pinCipher,
          ),
        });
        boundAtms.add(profile.atmId);
        withdrawalContexts.bind({
          atmId: profile.atmId,
          atmRevision: profile.atmRevision,
          terminalId: profile.terminalId,
          endpoint: profile.endpoint,
          provider: new QaWithdrawalExecutionProvider(
            profile,
            executionProfiles,
            withdrawalPolicies,
            cardIdentity,
            pinEntry,
            pinCipher,
          ),
        });
      }
    } catch {
      // Preserve absent/invalid private configuration. No guessed keys, serials
      // or captured security is installed as a replacement provider.
    }
    try {
      const cms = await new FileQaCmsAtmEvidence(
        join(app.getPath('userData'), 'qa-cms-atm-evidence.json'),
      ).read();
      for (const binding of cms) {
        if (!boundAtms.has(binding.atmId)) {
          balanceContexts.bind(documentedCmsAtmContextBinding(binding));
          boundAtms.add(binding.atmId);
        }
      }
    } catch {
      // A documentary terminal-master-key match never enables direct ISO PIN.
    }
    try {
      const documented = await new FileQaAtmEvidenceBindings(
        join(app.getPath('userData'), 'qa-atm-evidence-bindings.json'),
      ).read();
      for (const binding of documented) {
        if (!boundAtms.has(binding.atmId))
          balanceContexts.bind(documentedQaAtmContextBinding(binding));
      }
    } catch {
      // Missing/invalid documentary data cannot activate financial execution.
      // Valid executable providers above retain priority over documentary ones.
    }
    const connection = new QaSwitchConnection();
    switchConnection = connection;
    const balanceTransport = new BalanceTcpTransport();
    balanceService = new BalanceInquiryService(
      new FileBalanceJournal(join(app.getPath('userData'), 'balance-executions.json')),
      {
        exchange: (request) =>
          connection.withTransaction(request.endpoint, () => balanceTransport.exchange(request)),
      },
      runtime,
      balanceContexts,
      90000,
    );
    const withdrawalTransport = new WithdrawalReversalTransport();
    withdrawalService = new WithdrawalService(
      new FileBalanceJournal(
        join(app.getPath('userData'), 'withdrawal-executions.json'),
        'WITHDRAWAL',
      ),
      {
        exchange: (request) =>
          connection.withTransaction(request.endpoint, () => withdrawalTransport.exchange(request)),
      },
      runtime,
      withdrawalContexts,
    );
    const application = new DesktopApplication(
      new FilePreferencesStore(join(app.getPath('userData'), 'preferences.json')),
      runtime,
      catalogs,
      new CmsV36Catalog(),
      new MediatorSchemaInspector(),
      new CapturedEvidenceCatalog(),
      observer,
      networkEvidence,
      cardReader,
      sendConfiguration,
      balanceService,
      switchConnection,
      withdrawalService,
    );
    withdrawalReceipts = new WithdrawalReceiptService(
      (request) => application.getWithdrawalExecution(request),
      new ElectronReceiptPrinter(() => window),
    );
    for (const channel of Object.values(channels)) {
      ipcMain.handle(channel, (event, payload: unknown) => {
        if (
          !window ||
          !isTrustedSender(
            {
              senderId: event.sender.id,
              frameIsMain: event.senderFrame === event.sender.mainFrame,
              frameUrl: event.senderFrame?.url,
            },
            window.webContents.id,
            rendererUrl,
          )
        )
          return failure('FORBIDDEN', 'Solicitud no autorizada.');
        switch (channel) {
          case channels.switchConnection:
            return application.switchConnectionAction('status', payload);
          case channels.connectSwitch:
            return application.switchConnectionAction('connect', payload);
          case channels.disconnectSwitch:
            return application.switchConnectionAction('disconnect', payload);
          case channels.reader:
            return readerSnapshot(payload);
          case channels.readCardIdentity:
            if (developmentReload)
              return failure(
                'IN_USE',
                'Actualizando la aplicación. Espera a que termine el reinicio.',
              );
            return cardIdentity
              ? cardIdentity.read(payload).finally(() => {
                  void publishReaderSnapshot();
                })
              : failure('SERVICE_UNAVAILABLE', 'El lector no está configurado.');
          case channels.snapshot:
            return payload === undefined
              ? application.getSnapshot()
              : failure('VALIDATION_ERROR', 'Solicitud inválida.');
          case channels.environment:
            return application.setEnvironment(payload);
          case channels.prepare:
            return application.prepare(payload);
          case channels.reviewDraft:
            return application.reviewDraft(payload);
          case channels.sendConfiguration:
            return application.getSendConfiguration(payload);
          case channels.saveSendConfiguration:
            return application.saveSendConfiguration(payload);
          case channels.prepareSendPlan:
            return application.prepareSendPlan(payload);
          case channels.balanceReadiness:
            return application.getBalanceReadiness(payload);
          case channels.withdrawalReadiness:
            return application.getWithdrawalReadiness(payload);
          case channels.executeWithdrawal:
            if (developmentReload)
              return failure(
                'IN_USE',
                'Actualizando la aplicación. Espera a que termine el reinicio.',
              );
            return application.executeWithdrawal(payload).finally(() => {
              void publishReaderSnapshot();
            });
          case channels.withdrawalExecution:
            return application.getWithdrawalExecution(payload);
          case channels.withdrawalHistory:
            return application.getWithdrawalHistory(payload);
          case channels.printWithdrawalReceipt:
            return withdrawalReceipts!.print(payload);
          case channels.executeBalance:
            if (developmentReload)
              return failure(
                'IN_USE',
                'Actualizando la aplicación. Espera a que termine el reinicio.',
              );
            return application.executeBalance(payload).finally(() => {
              void publishReaderSnapshot();
            });
          case channels.balanceExecution:
            return application.getBalanceExecution(payload);
          case channels.balanceHistory:
            return application.getBalanceHistory(payload);
          case channels.observations:
            return application.searchObservations(payload);
          case channels.catalog:
            return application.catalog('list', payload);
          case channels.saveEntity:
            return application.catalog('saveEntity', payload);
          case channels.deleteEntity:
            return application.catalog('deleteEntity', payload);
          case channels.saveAtm:
            return application.catalog('saveAtm', payload);
          case channels.deleteAtm:
            return application.catalog('deleteAtm', payload);
          case channels.saveCase:
            return application.catalog('saveCase', payload);
          case channels.deleteCase:
            return application.catalog('deleteCase', payload);
        }
      });
    }
    await createWindow();
    if (development && process.send) {
      // Private parent-process IPC; never exposed to the Renderer.
      process.on('message', (message: unknown) => {
        if (message === 'DEV_RELOAD') {
          developmentReload = true;
          reloadDevelopmentWhenIdle();
        }
      });
      process.send('DEV_READY');
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  })
  .catch(() => {
    dialog.showErrorBox(
      'Coonecta',
      'No se pudo iniciar la aplicación. Revisa la instalación y los permisos locales.',
    );
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', (event) => {
  clearTimeout(developmentReloadTimer);
  switchConnection?.disconnect('APP_CLOSED');
  observer?.close();
  cardReader?.close();
  cardIdentity?.close();
  if (quitting || !catalogs) return;
  event.preventDefault();
  quitting = true;
  void catalogs.close().finally(() => app.quit());
});
