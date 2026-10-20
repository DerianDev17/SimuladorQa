import { randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import { FileSavedCardProfileStore } from '../../apps/desktop/src/main/infrastructure/saved-card-profile-store';
import { SavedCardProfileService } from '../../apps/desktop/src/main/saved-card-profile-service';
import type { RuntimeIdentity } from '../../apps/desktop/src/main/ports';
import { removeTestDirectory } from '../helpers/temporary-directory';

const runtime: RuntimeIdentity = {
  agentId: randomUUID(),
  hostname: 'qa-card-profile-test',
  user: 'tester',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-20T12:00:00.000Z',
};

const reading: CardIdentityReading = {
  readId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
  readAt: '2026-10-20T12:00:00.000Z',
  readerName: 'Synthetic reader',
  status: 'READ',
  applications: [],
  applicationId: 'A1B2C3D4E5F6',
  applicationLabel: 'VISA DEBIT',
  panMasked: '412345**2267',
  cardholderName: 'Example User',
  expiry: '10/27',
};

describe('inventario QA persistente desde una lectura vigente', () => {
  it('guarda los datos mínimos, los recupera tras abrir el archivo de nuevo y permite eliminarlos', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'coonecta-card-profiles-'));
    try {
      const file = join(directory, 'qa-card-profiles.json');
      const store = new FileSavedCardProfileStore(file);
      const service = new SavedCardProfileService(
        { current: async () => reading },
        { read: async () => ({ version: 1, environment: 'QA', audit: [] }) },
        store,
        runtime,
      );

      expect(await service.list(undefined)).toEqual({ ok: true, value: [] });
      const saved = await service.save({ readId: reading.readId, alias: 'Visa QA azul' });
      expect(saved).toMatchObject({
        ok: true,
        value: [
          {
            alias: 'Visa QA azul',
            lastFour: '2267',
            applicationId: 'A1B2C3D4E5F6',
            scope: 'QA_REFERENCE_ONLY',
          },
        ],
      });
      const reloaded = await new FileSavedCardProfileStore(file).read();
      expect(reloaded.profiles).toHaveLength(1);
      const serialized = JSON.stringify(reloaded);
      expect(serialized).not.toMatch(/Example User|10\/27|412345|panMasked|track|pin|cvv/i);
      if (!saved.ok) throw new Error('Expected saved profile');
      expect(await service.delete({ id: saved.value[0]!.id })).toEqual({ ok: true, value: [] });
    } finally {
      await removeTestDirectory(directory, 'coonecta-card-profiles-');
    }
  });

  it('bloquea identidad vencida, datos adicionales, ambiente PREPROD y almacenamiento no disponible', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'coonecta-card-profiles-'));
    try {
      const file = join(directory, 'qa-card-profiles.json');
      const store = new FileSavedCardProfileStore(file);
      const qa = new SavedCardProfileService(
        { current: async () => null },
        { read: async () => ({ version: 1, environment: 'QA', audit: [] }) },
        store,
        runtime,
      );
      expect(await qa.save({ readId: reading.readId, alias: 'Tarjeta QA' })).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT' },
      });
      expect(
        await qa.save({ readId: reading.readId, alias: 'Tarjeta QA', pan: 'not-accepted' }),
      ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });

      const preprod = new SavedCardProfileService(
        { current: async () => reading },
        { read: async () => ({ version: 1, environment: 'PREPROD', audit: [] }) },
        store,
        runtime,
      );
      expect(await preprod.list(undefined)).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });

      const unavailable = new SavedCardProfileService(
        { current: async () => reading },
        {
          read: async () => {
            throw new Error('unavailable');
          },
        },
        store,
        runtime,
      );
      expect(await unavailable.list(undefined)).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });

      const unreadableStore = new SavedCardProfileService(
        { current: async () => reading },
        { read: async () => ({ version: 1, environment: 'QA', audit: [] }) },
        {
          read: async () => {
            throw new Error('corrupt');
          },
          write: async () => undefined,
        },
        runtime,
      );
      expect(await unreadableStore.list(undefined)).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
    } finally {
      await removeTestDirectory(directory, 'coonecta-card-profiles-');
    }
  });
});
