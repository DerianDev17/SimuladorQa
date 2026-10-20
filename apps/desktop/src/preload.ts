import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { channels, desktopEvents } from '../../../packages/shared/src/contracts';
import type { DesktopApi } from '../../../packages/shared/src/contracts';

const api: DesktopApi = Object.freeze<DesktopApi>({
  getSnapshot: () => ipcRenderer.invoke(channels.snapshot),
  getSwitchConnection: (environment) =>
    ipcRenderer.invoke(channels.switchConnection, { environment }),
  connectSwitch: (environment) => ipcRenderer.invoke(channels.connectSwitch, { environment }),
  disconnectSwitch: (environment) => ipcRenderer.invoke(channels.disconnectSwitch, { environment }),
  getSendConfiguration: (environment) =>
    ipcRenderer.invoke(channels.sendConfiguration, { environment }),
  saveSendConfiguration: (request) => ipcRenderer.invoke(channels.saveSendConfiguration, request),
  prepareSendPlan: (request) => ipcRenderer.invoke(channels.prepareSendPlan, request),
  getBalanceReadiness: (request) => ipcRenderer.invoke(channels.balanceReadiness, request),
  executeBalance: (request) => ipcRenderer.invoke(channels.executeBalance, request),
  getBalanceExecution: (request) => ipcRenderer.invoke(channels.balanceExecution, request),
  getBalanceHistory: (environment) => ipcRenderer.invoke(channels.balanceHistory, { environment }),
  getWithdrawalReadiness: (request) => ipcRenderer.invoke(channels.withdrawalReadiness, request),
  executeWithdrawal: (request) => ipcRenderer.invoke(channels.executeWithdrawal, request),
  getWithdrawalExecution: (request) => ipcRenderer.invoke(channels.withdrawalExecution, request),
  getWithdrawalHistory: (environment) =>
    ipcRenderer.invoke(channels.withdrawalHistory, { environment }),
  printWithdrawalReceipt: (request) => ipcRenderer.invoke(channels.printWithdrawalReceipt, request),
  getReaderSnapshot: () => ipcRenderer.invoke(channels.reader),
  onReaderSnapshot: (listener) => {
    const receive = (_event: IpcRendererEvent, result: Parameters<typeof listener>[0]) =>
      listener(result);
    ipcRenderer.on(desktopEvents.readerChanged, receive);
    return () => {
      ipcRenderer.removeListener(desktopEvents.readerChanged, receive);
    };
  },
  readCardIdentity: (request) => ipcRenderer.invoke(channels.readCardIdentity, request),
  generateVirtualCardFixtures: (request) =>
    ipcRenderer.invoke(channels.generateVirtualCardFixtures, request),
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
  prepareLoadTest: (request) => ipcRenderer.invoke(channels.prepareLoadTest, request),
});
contextBridge.exposeInMainWorld('desktop', api);
