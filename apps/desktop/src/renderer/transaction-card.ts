import type { CardReaderSnapshot } from '../../../../packages/domain/src/card-reader';
import type { SavedCardProfile } from '../../../../packages/domain/src/saved-card-profiles';

import { matchingCardIdentity } from './card-reader-state';

// Referencia de identidad para la UI; no es un perfil financiero ni un payload ISO.
export interface TransactionCard {
  readId: string;
  readerName: string;
  panMasked: string | null;
  applicationLabel: string | null;
  applicationId: string | null;
}

export function matchesSavedCardProfile(profile: SavedCardProfile, card: TransactionCard): boolean {
  return (
    profile.applicationId !== null &&
    profile.applicationId === card.applicationId &&
    (!profile.lastFour || card.panMasked?.endsWith(profile.lastFour) === true)
  );
}

export function availableTransactionCard(
  snapshot: CardReaderSnapshot | undefined,
  readerName: string | undefined,
): TransactionCard | undefined {
  const identity = matchingCardIdentity(snapshot, readerName);
  if (identity?.status !== 'READ') return undefined;
  return {
    readId: identity.readId,
    readerName: identity.readerName,
    panMasked: identity.panMasked,
    applicationLabel: identity.applicationLabel,
    applicationId: identity.applicationId,
  };
}
