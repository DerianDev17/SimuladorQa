export interface ReaderDevice {
  name: string;
  state: 'CARD_PRESENT' | 'EMPTY' | 'UNAVAILABLE';
  atr: string | null;
}

export interface CardReaderSnapshot {
  checkedAt: string;
  readers: readonly ReaderDevice[];
  identityStatus: 'NOT_READ';
}

// Reader presence/ATR is separate from card identity and payment authentication.
export interface CardReaderAdapter {
  inspect(): Promise<CardReaderSnapshot>;
}
