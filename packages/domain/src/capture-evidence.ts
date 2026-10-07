// Metadatos permitidos en IPC. Nunca contiene RAW, campos de negocio ni endpoints.
export interface CaptureSummary {
  id: string;
  file: string;
  sha256: string;
  bytes: number;
  inspectedDirections: number;
  unsupportedDirections: number;
  conflictingDirections: number;
  incompleteDirections: number;
  messages: number;
  mtiCounts: Readonly<Record<string, number>>;
}

export interface CaptureEvidence {
  id: string;
  inspectedAt: string;
  document: string;
  environment: 'UNCONFIRMED';
  profile: {
    name: string;
    prefixBytes: 2;
    byteOrder: 'BIG_ENDIAN';
    lengthIncludesPrefix: true;
    headerBytes: 12;
    mtiEncoding: 'ASCII';
    bitmapEncoding: 'ASCII_HEX';
    bitmapBits: 128;
    minimumObservedBytes: number;
    maximumObservedBytes: number;
    headers: readonly string[];
  };
  captures: readonly CaptureSummary[];
}

export interface CaptureEvidenceCatalog {
  readonly report: CaptureEvidence;
}
