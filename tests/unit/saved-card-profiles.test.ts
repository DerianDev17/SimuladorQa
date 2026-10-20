import { describe, expect, it } from 'vitest';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import {
  createSavedCardProfile,
  parseDeleteCardProfileRequest,
  parseSaveCardProfileRequest,
  parseSavedCardProfileFile,
} from '../../packages/domain/src/saved-card-profiles';

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

describe('perfiles locales de referencia de tarjetas', () => {
  it('acepta solo alias y readId; rechaza credenciales adicionales y nombres con números largos', () => {
    expect(parseSaveCardProfileRequest({ readId: reading.readId, alias: 'Visa QA azul' })).toEqual({
      readId: reading.readId,
      alias: 'Visa QA azul',
    });
    expect(
      parseSaveCardProfileRequest({ readId: reading.readId, alias: `Card ${'1'.repeat(12)}` }),
    ).toBeUndefined();
    expect(
      parseSaveCardProfileRequest({ readId: reading.readId, alias: 'Visa QA', pin: '1234' }),
    ).toBeUndefined();
    expect(parseDeleteCardProfileRequest({ id: reading.readId })).toEqual({ id: reading.readId });
    expect(parseDeleteCardProfileRequest({ id: reading.readId, pan: 'extra' })).toBeUndefined();
  });

  it('proyecta solo alias, últimos cuatro y AID, no los demás datos del chip', () => {
    const profile = createSavedCardProfile(
      reading,
      { readId: reading.readId, alias: 'Visa QA azul' },
      'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
      '2026-10-20T12:01:00.000Z',
    );
    expect(profile).toEqual({
      id: 'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
      alias: 'Visa QA azul',
      lastFour: '2267',
      applicationId: 'A1B2C3D4E5F6',
      savedAt: '2026-10-20T12:01:00.000Z',
      scope: 'QA_REFERENCE_ONLY',
    });
    expect(JSON.stringify(profile)).not.toMatch(/cardholder|expiry|panMasked|track|pin|cvv/i);
    expect(
      createSavedCardProfile(
        { ...reading, status: 'DIRECTORY_UNAVAILABLE' },
        { readId: reading.readId, alias: 'Visa QA azul' },
        'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
        '2026-10-20T12:01:00.000Z',
      ),
    ).toBeUndefined();
  });

  it('valida estrictamente el archivo local y evita duplicar IDs', () => {
    const profile = {
      id: 'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
      alias: 'Visa QA azul',
      lastFour: '2267',
      applicationId: 'A1B2C3D4E5F6',
      savedAt: '2026-10-20T12:01:00.000Z',
      scope: 'QA_REFERENCE_ONLY',
    };
    expect(parseSavedCardProfileFile({ version: 1, profiles: [profile] })).toEqual({
      version: 1,
      profiles: [profile],
    });
    expect(
      parseSavedCardProfileFile({ version: 1, profiles: [{ ...profile, pan: 'extra' }] }),
    ).toBe(undefined);
    expect(parseSavedCardProfileFile({ version: 1, profiles: [profile, profile] })).toBeUndefined();
  });
});
