import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import { channels, desktopEvents } from '../../../packages/shared/src/contracts';
import type { DesktopApi } from '../../../packages/shared/src/contracts';
import { IpcReadRequests } from './ipc-read-requests';

const reads = new IpcReadRequests();
const invoke: typeof ipcRenderer.invoke = (channel: string, ...args: unknown[]) =>
  reads.run(channel, args, () => ipcRenderer.invoke(channel, ...args));

const api: DesktopApi = Object.freeze<DesktopApi>({
  getSessionMessages: (request) => invoke(channels.sessionMessages, request),
  getSnapshot: () => invoke(channels.snapshot),
  getSwitchConnection: (environment) => invoke(channels.switchConnection, { environment }),
  connectSwitch: (environment) => invoke(channels.connectSwitch, { environment }),
  disconnectSwitch: (environment) => invoke(channels.disconnectSwitch, { environment }),
  getSendConfiguration: (environment) => invoke(channels.sendConfiguration, { environment }),
  saveSendConfiguration: (request) => invoke(channels.saveSendConfiguration, request),
  prepareSendPlan: (request) => invoke(channels.prepareSendPlan, request),
  getBalanceReadiness: (request) => invoke(channels.balanceReadiness, request),
  executeBalance: (request) => invoke(channels.executeBalance, request),
  getBalanceExecution: (request) => invoke(channels.balanceExecution, request),
  getBalanceHistory: (environment) => invoke(channels.balanceHistory, { environment }),
  getDepositReadiness: (request) => invoke(channels.depositReadiness, request),
  executeDeposit: (request) => invoke(channels.executeDeposit, request),
  getDepositExecution: (request) => invoke(channels.depositExecution, request),
  getDepositHistory: (environment) => invoke(channels.depositHistory, { environment }),
  getWithdrawalReadiness: (request) => invoke(channels.withdrawalReadiness, request),
  executeWithdrawal: (request) => invoke(channels.executeWithdrawal, request),
  getWithdrawalExecution: (request) => invoke(channels.withdrawalExecution, request),
  getWithdrawalHistory: (environment) => invoke(channels.withdrawalHistory, { environment }),
  printWithdrawalReceipt: (request) => invoke(channels.printWithdrawalReceipt, request),
  getReaderSnapshot: () => invoke(channels.reader),
  onReaderSnapshot: (listener) => {
    const receive = (_event: IpcRendererEvent, result: Parameters<typeof listener>[0]) => {
      reads.invalidate(channels.reader);
      listener(result);
    };
    ipcRenderer.on(desktopEvents.readerChanged, receive);
    return () => {
      ipcRenderer.removeListener(desktopEvents.readerChanged, receive);
    };
  },
  readCardIdentity: (request) => invoke(channels.readCardIdentity, request),
  generateVirtualCardFixtures: (request) => invoke(channels.generateVirtualCardFixtures, request),
  listSavedCardProfiles: () => invoke(channels.listSavedCardProfiles),
  saveCardProfile: (request) => invoke(channels.saveCardProfile, request),
  updateCardProfile: (request) => invoke(channels.updateCardProfile, request),
  deleteCardProfile: (request) => invoke(channels.deleteCardProfile, request),
  setEnvironment: (environment) => invoke(channels.environment, { environment }),
  prepareTransaction: (request) => invoke(channels.prepare, request),
  reviewDraft: (request) => invoke(channels.reviewDraft, request),
  getCatalog: (environment) => invoke(channels.catalog, { environment }),
  saveEntity: (request) => invoke(channels.saveEntity, request),
  deleteEntity: (request) => invoke(channels.deleteEntity, request),
  saveAtm: (request) => invoke(channels.saveAtm, request),
  createQaAtm: (request) => invoke(channels.createQaAtm, request),
  // Explicit inspection retries must not reuse a request whose Renderer deadline expired.
  inspectQaAtm: (request) => ipcRenderer.invoke(channels.inspectQaAtm, request),
  testQaAtmBalance: (request) => invoke(channels.testQaAtmBalance, request),
  deleteAtm: (request) => invoke(channels.deleteAtm, request),
  saveCase: (request) => invoke(channels.saveCase, request),
  deleteCase: (request) => invoke(channels.deleteCase, request),
  searchObservations: (request) => invoke(channels.observations, request),
  getMediatorLive: (request) => invoke(channels.mediatorLive, request),
  startLoadRun: (request) => invoke(channels.startLoadRun, request),
  getLoadConfigurations: () => invoke(channels.loadConfigurations),
  saveLoadConfiguration: (request) => invoke(channels.saveLoadConfiguration, request),
  deleteLoadConfiguration: (request) => invoke(channels.deleteLoadConfiguration, request),
  exportLoadRun: (request) => invoke(channels.exportLoadRun, request),
  listLoadHistory: (request) => invoke(channels.loadHistory, request),
  getLoadHistory: (request) => invoke(channels.loadHistoryDetail, request),
  getLoadRun: () => invoke(channels.loadRun),
  stopLoadRun: (request) => invoke(channels.stopLoadRun, request),
});
contextBridge.exposeInMainWorld('desktop', api);
