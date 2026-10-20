import { describe, expect, it } from 'vitest';
import {
  availableTransactionCard,
  matchesSavedCardProfile,
} from '../../apps/desktop/src/renderer/transaction-card';
import type { SavedCardProfile } from '../../packages/domain/src/saved-card-profiles';
import type { CardReaderSnapshot } from '../../packages/domain/src/card-reader';

const snapshot: CardReaderSnapshot = {
  checkedAt: '2026-10-11T23:00:00.000Z',
  identityStatus: 'READ',
  readers: [{ name: 'Synthetic Contact', state: 'CARD_PRESENT', atr: '3B00' }],
  identity: {
    readId: 'aec7f38a-5e1c-490d-9636-c6d7e4b060d6',
    readAt: '2026-10-11T23:00:00.000Z',
    readerName: 'Synthetic Contact',
    status: 'READ',
    applications: [],
    applicationId: 'A0000000031010',
    applicationLabel: 'TEST CARD',
    panMasked: '*'.repeat(12) + '4444',
    cardholderName: 'TEST USER',
    expiry: '12/29',
  },
};

describe('referencia de tarjeta para preparar la UI', () => {
  it('selecciona solo una identidad leída de la interfaz con tarjeta presente', () => {
    expect(availableTransactionCard(snapshot, 'Synthetic Contact')).toEqual({
      readId: snapshot.identity!.readId,
      readerName: 'Synthetic Contact',
      panMasked: snapshot.identity!.panMasked,
      applicationLabel: 'TEST CARD',
      applicationId: 'A0000000031010',
    });
  });
  it('no agrega titular, ATR, cuenta, datos financieros ni datos para transmitir', () => {
    const card = availableTransactionCard(snapshot, 'Synthetic Contact');
    expect(Object.keys(card!)).toEqual([
      'readId',
      'readerName',
      'panMasked',
      'applicationLabel',
      'applicationId',
    ]);
    expect(card).not.toHaveProperty('account');
  });
  it('no inventa número ni aplicación cuando el chip no los expone', () => {
    expect(
      availableTransactionCard(
        {
          ...snapshot,
          identity: { ...snapshot.identity!, panMasked: null, applicationLabel: null },
        },
        'Synthetic Contact',
      ),
    ).toMatchObject({ panMasked: null, applicationLabel: null });
  });
  it('solo asocia un perfil QA cuando coinciden AID y últimos cuatro', () => {
    const card = availableTransactionCard(snapshot, 'Synthetic Contact')!;
    const profile: SavedCardProfile = {
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
      alias: 'Visa QA',
      lastFour: '4444',
      applicationId: 'A0000000031010',
      applicationLabel: 'TEST CARD',
      transactionDataRequirements: null,
      defaultAccount: 'SAVINGS',
      savedAt: '2026-10-11T23:00:00.000Z',
      scope: 'QA_REFERENCE_ONLY',
    };
    expect(matchesSavedCardProfile(profile, card)).toBe(true);
    expect(matchesSavedCardProfile({ ...profile, applicationId: 'A0000000032020' }, card)).toBe(
      false,
    );
    expect(matchesSavedCardProfile({ ...profile, lastFour: '5555' }, card)).toBe(false);
    expect(
      matchesSavedCardProfile(
        { ...profile, applicationId: null, lastFour: null },
        {
          ...card,
          applicationId: null,
        },
      ),
    ).toBe(false);
  });
  it.each(['EMPTY', 'UNAVAILABLE'] as const)(
    'descarta la selección si la tarjeta pasa a %s',
    (state) => {
      expect(
        availableTransactionCard(
          { ...snapshot, readers: [{ ...snapshot.readers[0]!, state }] },
          'Synthetic Contact',
        ),
      ).toBeUndefined();
    },
  );
  it.each(['SELECT_APPLICATION', 'DIRECTORY_UNAVAILABLE', 'TERMINAL_DATA_REQUIRED'] as const)(
    'no presenta %s como identidad lista',
    (status) => {
      expect(
        availableTransactionCard(
          { ...snapshot, identity: { ...snapshot.identity!, status } },
          'Synthetic Contact',
        ),
      ).toBeUndefined();
    },
  );
  it('requiere elegir de nuevo cuando cambia la interfaz y descarta estados inconsistentes', () => {
    expect(availableTransactionCard(snapshot, 'Other Contact')).toBeUndefined();
    expect(
      availableTransactionCard({ ...snapshot, identityStatus: 'NOT_READ' }, 'Synthetic Contact'),
    ).toBeUndefined();
    expect(
      availableTransactionCard({ ...snapshot, identity: null }, 'Synthetic Contact'),
    ).toBeUndefined();
  });
  it('no conserva una tarjeta tras error, timeout o ausencia del servicio', () => {
    expect(availableTransactionCard(undefined, 'Synthetic Contact')).toBeUndefined();
    expect(
      availableTransactionCard({ ...snapshot, readers: [] }, 'Synthetic Contact'),
    ).toBeUndefined();
  });
});
