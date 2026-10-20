import type { IpcMain } from 'electron';
import { randomUUID } from 'node:crypto';
import { SavedCardProfileService } from '../../apps/desktop/src/main/saved-card-profile-service';
import { FileSavedCardProfileStore } from '../../apps/desktop/src/main/infrastructure/saved-card-profile-store';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import { channels } from '../../packages/shared/src/contracts';

// Synthetic hardware only. Persistence and profile validation use the real services.
export function install(ipc: IpcMain, file: string) {
  let current: CardIdentityReading | undefined;
  const reading: CardIdentityReading = {
    readId: randomUUID(),
    readAt: new Date().toISOString(),
    readerName: 'Lector QA de prueba',
    status: 'READ',
    applications: [],
    applicationId: 'A1B2C3D4E5F6',
    applicationLabel: 'VISA DEBITO',
    panMasked: '************2267',
    cardholderName: null,
    expiry: null,
    transactionDataRequirements: { cdol1: [{ tag: '9F02', length: 6 }], cdol2: null },
  };
  const service = new SavedCardProfileService(
    { current: async () => current ?? null },
    { read: async () => ({ version: 1, environment: 'QA', audit: [] }) },
    new FileSavedCardProfileStore(file),
    {
      agentId: randomUUID(),
      hostname: 'test',
      user: 'test',
      version: 'test',
      uuid: randomUUID,
      now: () => new Date().toISOString(),
    },
  );
  const handle = (channel: string, operation: (payload: unknown) => unknown) => {
    ipc.removeHandler(channel);
    ipc.handle(channel, (_event, payload: unknown) => operation(payload));
  };
  handle('reader:inspect', () => ({
    ok: true,
    value: {
      checkedAt: new Date().toISOString(),
      readers: [{ name: reading.readerName, state: 'CARD_PRESENT', atr: '3B00' }],
      identityStatus: current ? 'READ' : 'NOT_READ',
      identity: current ?? null,
    },
  }));
  handle('reader:identity:read', () => {
    current = { ...reading, readId: randomUUID() };
    return { ok: true, value: current };
  });
  handle(channels.listSavedCardProfiles, (payload) => service.list(payload));
  handle(channels.saveCardProfile, (payload) => service.save(payload));
  handle(channels.updateCardProfile, (payload) => service.update(payload));
  handle(channels.deleteCardProfile, (payload) => service.delete(payload));
}
