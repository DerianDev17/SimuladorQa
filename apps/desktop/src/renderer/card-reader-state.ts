import type {
  CardReaderSnapshot,
  CardIdentityReading,
  ReaderDevice,
} from '../../../../packages/domain/src/card-reader';

export const readerStateLabels = {
  CARD_PRESENT: 'Tarjeta presente',
  EMPTY: 'Sin tarjeta',
  UNAVAILABLE: 'Lector no disponible',
} satisfies Record<ReaderDevice['state'], string>;

export function selectedReader(
  snapshot: CardReaderSnapshot | undefined,
  name: string | undefined,
): ReaderDevice | undefined {
  return (
    snapshot?.readers.find((reader) => reader.name === name) ??
    snapshot?.readers.find((reader) => reader.state === 'CARD_PRESENT') ??
    snapshot?.readers[0]
  );
}
export function matchingCardIdentity(
  snapshot: CardReaderSnapshot | undefined,
  name: string | undefined,
): CardIdentityReading | undefined {
  const identity = snapshot?.identity;
  if (
    !identity ||
    identity.readerName !== name ||
    !snapshot?.readers.some((reader) => reader.name === name && reader.state === 'CARD_PRESENT') ||
    (identity.status === 'READ' && snapshot.identityStatus !== 'READ')
  )
    return undefined;
  return identity;
}
