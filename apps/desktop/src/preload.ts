import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '../../../packages/shared/src/contracts';
import type { DesktopApi } from '../../../packages/shared/src/contracts';

const api: DesktopApi = Object.freeze<DesktopApi>({
  getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
  setEnvironment: (environment) => ipcRenderer.invoke(channels.environment, { environment }),
  prepareTransaction: (request) => ipcRenderer.invoke(channels.prepare, request),
});
contextBridge.exposeInMainWorld('desktop', api);
