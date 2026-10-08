import { contextBridge, ipcRenderer } from 'electron';
import { channels } from '../../../packages/shared/src/contracts';
import type { DesktopApi } from '../../../packages/shared/src/contracts';

const api: DesktopApi = Object.freeze<DesktopApi>({
  getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
  getReaderSnapshot: () => ipcRenderer.invoke(channels.reader),
  setEnvironment: (environment) => ipcRenderer.invoke(channels.environment, { environment }),
  prepareTransaction: (request) => ipcRenderer.invoke(channels.prepare, request),
  reviewDraft: (request) => ipcRenderer.invoke(channels.reviewDraft, request),
  getCatalog: (environment) => ipcRenderer.invoke(channels.catalog, { environment }),
  saveEntity: (request) => ipcRenderer.invoke(channels.saveEntity, request),
  deleteEntity: (request) => ipcRenderer.invoke(channels.deleteEntity, request),
  saveAtm: (request) => ipcRenderer.invoke(channels.saveAtm, request),
  deleteAtm: (request) => ipcRenderer.invoke(channels.deleteAtm, request),
  saveCase: (request) => ipcRenderer.invoke(channels.saveCase, request),
  deleteCase: (request) => ipcRenderer.invoke(channels.deleteCase, request),
  searchObservations: (request) => ipcRenderer.invoke(channels.observations, request),
});
contextBridge.exposeInMainWorld('desktop', api);
