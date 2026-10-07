import { app, BrowserWindow, dialog, ipcMain, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { hostname, userInfo } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { channels, failure } from '../../../../packages/shared/src/contracts';
import { DesktopApplication } from './application';
import { FilePreferencesStore } from './infrastructure/preferences-store';
import { isTrustedSender } from './security';
import { WorkerCatalogStore } from './infrastructure/worker-catalog-store';
import { CmsV36Catalog } from './adapters/cms-v36-catalog';
import { MediatorSchemaInspector } from './adapters/mediator-schema-inspector';
import { CapturedEvidenceCatalog } from './adapters/captured-evidence-catalog';
import { MediatorObserver } from './adapters/mediator-observer';
import { FileNetworkEvidence } from './adapters/file-network-evidence';

const development = process.argv.includes('--dev');
const rendererFile = join(__dirname, 'renderer', 'index.html');
const rendererUrl = development ? 'http://127.0.0.1:5173/' : pathToFileURL(rendererFile).href;
let window: BrowserWindow | null = null;
let catalogs: WorkerCatalogStore | undefined;
let observer: MediatorObserver | undefined;
let quitting = false;

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
    const application = new DesktopApplication(
      new FilePreferencesStore(join(app.getPath('userData'), 'preferences.json')),
      {
        agentId: randomUUID(),
        hostname: hostname(),
        user: userInfo().username,
        version: '0.1.0',
        uuid: randomUUID,
        now: () => new Date().toISOString(),
      },
      catalogs,
      new CmsV36Catalog(),
      new MediatorSchemaInspector(),
      new CapturedEvidenceCatalog(),
      observer,
      await FileNetworkEvidence.load(join(app.getPath('userData'), 'network-evidence.json')),
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
  observer?.close();
  if (quitting || !catalogs) return;
  event.preventDefault();
  quitting = true;
  void catalogs.close().finally(() => app.quit());
});
