export interface ReaderDevice {
  name: string;
  state: 'CARD_PRESENT' | 'EMPTY' | 'UNAVAILABLE';
  atr: string | null;
}

export interface CardReaderSnapshot {
  checkedAt: string;
  readers: readonly ReaderDevice[];
  identityStatus: 'NOT_READ' | 'READ';
  identity?: CardIdentityReading | null;
}

// Reader presence/ATR is separate from card identity and payment authentication.
export interface CardReaderAdapter {
  inspect(): Promise<CardReaderSnapshot>;
}

export interface CardIdentityRequest {
  readerName: string;
  applicationId?: string;
  terminalCountryCode?: string;
}

export interface CardApplication {
  id: string;
  label: string | null;
}

export interface CardIdentityReading {
  readId: string;
  readAt: string;
  readerName: string;
  status: 'READ' | 'SELECT_APPLICATION' | 'DIRECTORY_UNAVAILABLE' | 'TERMINAL_DATA_REQUIRED';
  applications: readonly CardApplication[];
  applicationId: string | null;
  applicationLabel: string | null;
  panMasked: string | null;
  cardholderName: string | null;
  expiry: string | null;
  requiredTerminalData?: readonly { tag: string; length: number }[];
}
