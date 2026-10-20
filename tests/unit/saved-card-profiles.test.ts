import { describe, expect, it } from 'vitest';
import type { CardIdentityReading } from '../../packages/domain/src/card-reader';
import {
  createSavedCardProfile,
  parseDeleteCardProfileRequest,
  parseSaveCardProfileRequest,
  parseSavedCardProfileFile,
  parseUpdateCardProfileRequest,
  updateSavedCardProfile,
  suggestCardProfileAlias,
  isValidCardProfileAlias,
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
  transactionDataRequirements: {
    cdol1: [
      { tag: '9F02', length: 6 },
      { tag: '9F37', length: 4 },
    ],
    cdol2: null,
  },
};

describe('perfiles locales de referencia de tarjetas', () => {
  it('el alias sugerido se puede guardar sin editar y limpia etiquetas del chip', () => {
    expect(suggestCardProfileAlias(reading)).toBe('VISA DEBIT - 2267');
    for (const applicationLabel of ['VISA/DEBIT', '•', 'A'.repeat(40), '1'.repeat(16)]) {
      const alias = suggestCardProfileAlias({ ...reading, applicationLabel });
      expect(parseSaveCardProfileRequest({ readId: reading.readId, alias })).toBeDefined();
    }
    expect(suggestCardProfileAlias(undefined)).toBe('');
    expect(isValidCardProfileAlias('VISA · •••• 2267')).toBe(false);
    expect(isValidCardProfileAlias('1234 '.repeat(4).trim())).toBe(false);
  });
  it('acepta solo alias y readId; rechaza credenciales adicionales y nombres con números largos', () => {
    expect(parseSaveCardProfileRequest({ readId: reading.readId, alias: 'Visa QA azul' })).toEqual({
      readId: reading.readId,
      alias: 'Visa QA azul',
      defaultAccount: null,
    });
    expect(
      parseSaveCardProfileRequest({
        readId: reading.readId,
        alias: 'Visa QA azul',
        defaultAccount: 'CURRENT',
      }),
    ).toMatchObject({ defaultAccount: 'CURRENT' });
    expect(
      parseSaveCardProfileRequest({ readId: reading.readId, alias: `Card ${'1'.repeat(12)}` }),
    ).toBeUndefined();
    expect(
      parseSaveCardProfileRequest({ readId: reading.readId, alias: 'Visa QA', pin: '1234' }),
    ).toBeUndefined();
    expect(parseDeleteCardProfileRequest({ id: reading.readId })).toEqual({ id: reading.readId });
    expect(parseDeleteCardProfileRequest({ id: reading.readId, pan: 'extra' })).toBeUndefined();
  });

  it('proyecta identidad segura, requisitos CDOL y cuenta opcional, no valores de autenticación', () => {
    const profile = createSavedCardProfile(
      reading,
      { readId: reading.readId, alias: 'Visa QA azul', defaultAccount: null },
      'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
      '2026-10-20T12:01:00.000Z',
    );
    expect(profile).toEqual({
      id: 'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
      alias: 'Visa QA azul',
      lastFour: '2267',
      applicationId: 'A1B2C3D4E5F6',
      applicationLabel: 'VISA DEBIT',
      transactionDataRequirements: {
        cdol1: [
          { tag: '9F02', length: 6 },
          { tag: '9F37', length: 4 },
        ],
        cdol2: null,
      },
      defaultAccount: null,
      savedAt: '2026-10-20T12:01:00.000Z',
      scope: 'QA_REFERENCE_ONLY',
    });
    expect(JSON.stringify(profile)).not.toMatch(/cardholder|expiry|panMasked|track|pin|cvv/i);
    expect(
      updateSavedCardProfile(profile!, {
        id: profile!.id,
        alias: 'Visa QA nueva',
        defaultAccount: 'CURRENT',
      }),
    ).toMatchObject({ alias: 'Visa QA nueva', defaultAccount: 'CURRENT' });
    expect(parseSavedCardProfileFile({ version: 2, profiles: [profile] })).toMatchObject({
      version: 2,
      profiles: [{ applicationLabel: 'VISA DEBIT' }],
    });
    expect(
      parseSavedCardProfileFile({
        version: 2,
        profiles: [
          {
            ...profile,
            transactionDataRequirements: {
              cdol1: [
                { tag: '9F02', length: 6 },
                { tag: '9F02', length: 6 },
              ],
              cdol2: null,
            },
          },
        ],
      }),
    ).toBeUndefined();
    expect(
      createSavedCardProfile(
        { ...reading, status: 'DIRECTORY_UNAVAILABLE' },
        { readId: reading.readId, alias: 'Visa QA azul', defaultAccount: null },
        'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
        '2026-10-20T12:01:00.000Z',
      ),
    ).toBeUndefined();
  });

  it('migra perfiles v1, valida estrictamente el archivo y evita duplicar IDs', () => {
    const profile = {
      id: 'bbbbbbbb-cccc-4ddd-8eee-fffffffffff1',
      alias: 'Visa QA azul',
      lastFour: '2267',
      applicationId: 'A1B2C3D4E5F6',
      savedAt: '2026-10-20T12:01:00.000Z',
      scope: 'QA_REFERENCE_ONLY',
    };
    expect(parseSavedCardProfileFile({ version: 1, profiles: [profile] })).toEqual({
      version: 2,
      profiles: [
        {
          ...profile,
          applicationLabel: null,
          transactionDataRequirements: null,
          defaultAccount: null,
        },
      ],
    });
    expect(
      parseSavedCardProfileFile({ version: 1, profiles: [{ ...profile, pan: 'extra' }] }),
    ).toBe(undefined);
    expect(parseSavedCardProfileFile({ version: 1, profiles: [profile, profile] })).toBeUndefined();
    expect(
      parseUpdateCardProfileRequest({ id: profile.id, alias: 'Editable', defaultAccount: 'NOPE' }),
    ).toBeUndefined();
  });
});
