import { LoadPinSession } from './adapters/load-pin-session';
import { LoadRunService } from './load-run-service';
import { PhysicalCardLoadDriver } from './physical-card-load-driver';
import { SqliteLoadRunStore } from './infrastructure/sqlite-load-run-store';
import { workerLoadScheduler } from './infrastructure/load-scheduler';
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
import { QaAtmTemplate, QaTemplateContextProvider } from './qa-atm-template';
import { FileQaExecutionProfiles } from './infrastructure/qa-execution-profiles';
import { FileQaWithdrawalPolicies } from './infrastructure/qa-withdrawal-policies';
import { WindowsQaPinEntry } from './adapters/qa-pin-entry';
import { WindowsQaPinCipher } from './adapters/qa-pin-cipher';
import { SqliteBalanceJournal } from './infrastructure/sqlite-balance-journal';
import { BalanceTcpTransport } from './adapters/balance-tcp-transport';
import { WithdrawalReversalTransport } from './adapters/withdrawal-reversal-transport';
import { FileNetworkEvidence } from './adapters/file-network-evidence';
import { inspectReader } from './adapters/windows-pcsc-reader';
import { WindowsPcscMonitor } from './adapters/windows-pcsc-monitor';
import { SimulatedCardReader } from './adapters/simulated-card-reader';
import { QaSwitchConnection } from './adapters/qa-switch-connection';
import { WindowsCardSession } from './adapters/windows-card-session';
import { CardIdentityService } from './card-identity-service';
import { LoadTestService } from './load-test-service';
import { VirtualCardGeneratorService } from './virtual-card-generator-service';
import { SavedCardProfileService } from './saved-card-profile-service';
import { FileSavedCardProfileStore } from './infrastructure/saved-card-profile-store';
import { drainBeforeQuit } from './shutdown-drain';

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
let loadRun: LoadRunService | undefined;
let loadTestService: LoadTestService | undefined;
let loadRunStore: SqliteLoadRunStore | undefined;
let virtualCardGenerator: VirtualCardGeneratorService | undefined;
let savedCardProfiles: SavedCardProfileService | undefined;
let financialApplication: DesktopApplication | undefined;
let financialJournals: SqliteBalanceJournal[] = [];
let quitting = false;
let developmentReload = false;
let developmentReloadTimer: ReturnType<typeof setTimeout> | undefined;

function reloadDevelopmentWhenIdle(): void {
  if (!developmentReload || quitting) return;
  clearTimeout(developmentReloadTimer);
  if (
    loadRun?.isBusy() ||
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
// Two processes using the same journals can both observe an absent requestId
// and send it before either sees the other's PENDING record.
const ownsInstanceLock = app.requestSingleInstanceLock();
if (!ownsInstanceLock) app.quit();
else
  app.on('second-instance', () => {
    const activeWindow = window ?? BrowserWindow.getAllWindows()[0];
    if (!activeWindow) return;
    if (activeWindow.isMinimized()) activeWindow.restore();
    activeWindow.focus();
  });

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

const startupReady = ownsInstanceLock ? app.whenReady() : Promise.resolve();
void startupReady
  .then(async () => {
    if (!ownsInstanceLock) return;
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
      loadRun?.observeReaders(snapshot?.readers ?? null);
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
    const preferences = new FilePreferencesStore(join(app.getPath('userData'), 'preferences.json'));
    loadTestService = new LoadTestService(runtime, preferences);
    virtualCardGenerator = new VirtualCardGeneratorService(runtime, preferences);
    savedCardProfiles = new SavedCardProfileService(
      cardIdentity,
      preferences,
      new FileSavedCardProfileStore(join(app.getPath('userData'), 'qa-card-profiles.json')),
      runtime,
    );
    const sendConfiguration = new SendConfigurationService(
      new FileSendConfigurationStore(join(app.getPath('userData'), 'send-configuration.json')),
      networkEvidence,
      runtime,
    );
    await sendConfiguration.initializeDocumentedQa();
    const withdrawalPolicies = new FileQaWithdrawalPolicies(
      join(app.getPath('userData'), 'qa-withdrawal-policies.json'),
    );
    const executionProfiles = new FileQaExecutionProfiles(
      join(app.getPath('userData'), 'qa-execution-profiles.json'),
    );
    const pinEntry = new LoadPinSession(new WindowsQaPinEntry(join(__dirname, 'qa-pin-entry.ps1')));
    const pinCipher = new WindowsQaPinCipher(
      join(__dirname, 'qa-pin-cipher.ps1'),
      join(app.getPath('userData'), 'qa-test-keys'),
    );
    const template = new QaAtmTemplate(
      executionProfiles,
      async () => {
        const snapshot = await catalogs!.execute(
          { kind: 'list', environment: 'QA' },
          {
            user: runtime.user,
            machine: runtime.hostname,
            timestamp: runtime.now(),
          },
        );
        if (!snapshot.ok) throw Error('QA_TEMPLATE_UNAVAILABLE');
        return snapshot.value;
      },
      withdrawalPolicies,
    );
    const balanceContexts = new QaTemplateContextProvider(
      template,
      'BALANCE',
      cardIdentity,
      pinEntry,
      pinCipher,
    );
    const withdrawalContexts = new QaTemplateContextProvider(
      template,
      'WITHDRAWAL',
      cardIdentity,
      pinEntry,
      pinCipher,
    );
    const connection = new QaSwitchConnection();
    switchConnection = connection;
    const balanceTransport = new BalanceTcpTransport();
    const balanceJournal = new SqliteBalanceJournal(
      join(app.getPath('userData'), 'balance-executions.sqlite'),
      join(app.getPath('userData'), 'balance-executions.json'),
    );
    balanceService = new BalanceInquiryService(
      balanceJournal,
      connection.manageTransport(balanceTransport),
      runtime,
      balanceContexts,
      90000,
    );
    const withdrawalTransport = new WithdrawalReversalTransport();
    const withdrawalJournal = new SqliteBalanceJournal(
      join(app.getPath('userData'), 'withdrawal-executions.sqlite'),
      join(app.getPath('userData'), 'withdrawal-executions.json'),
      'WITHDRAWAL',
    );
    financialJournals = [balanceJournal, withdrawalJournal];
    withdrawalService = new WithdrawalService(
      withdrawalJournal,
      connection.manageTransport(withdrawalTransport),
      runtime,
      withdrawalContexts,
    );
    const application = new DesktopApplication(
      preferences,
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
    financialApplication = application;
    loadRunStore = new SqliteLoadRunStore(
      join(app.getPath('userData'), 'qa-load-runs.sqlite'),
      join(app.getPath('userData'), 'qa-load-runs.json'),
    );
    loadRun = new LoadRunService(
      runtime,
      new PhysicalCardLoadDriver(
        cardIdentity,
        application,
        pinEntry,
        balanceJournal,
        runtime,
        () => void publishReaderSnapshot(),
      ),
      loadRunStore,
      workerLoadScheduler(join(__dirname, 'load-worker.cjs')),
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
        if (quitting) return failure('SERVICE_UNAVAILABLE', 'La aplicación se está cerrando.');
        if (
          loadRun?.isBusy() &&
          new Set<string>([
            channels.environment,
            channels.readCardIdentity,
            channels.executeBalance,
            channels.executeWithdrawal,
            channels.connectSwitch,
            channels.disconnectSwitch,
            channels.saveSendConfiguration,
            channels.saveAtm,
            channels.deleteAtm,
            channels.saveEntity,
            channels.deleteEntity,
          ]).has(channel)
        )
          return failure(
            'CONFLICT',
            'Detén la corrida de carga antes de cambiar el contexto o enviar otra operación.',
          );
        switch (channel) {
          case channels.startLoadRun:
            if (
              developmentReload ||
              application.isFinancialBusy() ||
              balanceService?.isBusy() ||
              withdrawalService?.isBusy() ||
              cardIdentity?.isBusy()
            )
              return failure('CONFLICT', 'Espera a que termine la operación actual.');
            return loadRun!.start(payload);
          case channels.loadRun:
            return loadRun!.current(payload);
          case channels.stopLoadRun:
            return loadRun!.stop(payload);
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
          case channels.generateVirtualCardFixtures:
            return (
              virtualCardGenerator?.generate(payload) ??
              failure('SERVICE_UNAVAILABLE', 'El generador local no está disponible.')
            );
          case channels.listSavedCardProfiles:
            return (
              savedCardProfiles?.list(payload) ??
              failure('SERVICE_UNAVAILABLE', 'El inventario local no está disponible.')
            );
          case channels.saveCardProfile:
            return (
              savedCardProfiles?.save(payload) ??
              failure('SERVICE_UNAVAILABLE', 'El inventario local no está disponible.')
            );
          case channels.updateCardProfile:
            return (
              savedCardProfiles?.update(payload) ??
              failure('SERVICE_UNAVAILABLE', 'El inventario local no está disponible.')
            );
          case channels.deleteCardProfile:
            return (
              savedCardProfiles?.delete(payload) ??
              failure('SERVICE_UNAVAILABLE', 'El inventario local no está disponible.')
            );
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
          case channels.mediatorLive:
            return application.getMediatorLive(payload);
          case channels.prepareLoadTest:
            return (
              loadTestService?.prepare(payload) ??
              failure('SERVICE_UNAVAILABLE', 'El preparador de carga no está disponible.')
            );
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
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  loadRun?.close();
  void (async () => {
    try {
      await drainBeforeQuit([
        financialApplication?.whenFinancialIdle() ?? Promise.resolve(),
        loadRun?.whenIdle() ?? Promise.resolve(),
      ]);
    } finally {
      try {
        switchConnection?.disconnect('APP_CLOSED');
        observer?.close();
        cardReader?.close();
        cardIdentity?.close();
        await loadRunStore?.close().catch(() => undefined);
        await Promise.allSettled(financialJournals.map((journal) => journal.close()));
        await catalogs?.close().catch(() => undefined);
      } finally {
        app.quit();
      }
    }
  })();
});
