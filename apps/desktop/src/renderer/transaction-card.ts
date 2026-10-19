import type { CardReaderSnapshot } from '../../../../packages/domain/src/card-reader';

import { matchingCardIdentity } from './card-reader-state';

// Referencia de identidad para la UI; no es un perfil financiero ni un payload ISO.
export interface TransactionCard {
  readId: string;
  readerName: string;
  panMasked: string | null;
  applicationLabel: string | null;
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
  };
}
