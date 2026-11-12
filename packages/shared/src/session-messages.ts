import type { IsoMessage } from '../../domain/src/iso-message';

// Separate from public journals/logs/exports. ADR-046 permits persistence only
// inside the encrypted QA archive; the legacy visibility marker stays stable.
export interface SessionIsoMessage extends IsoMessage {
  visibility: 'UNMASKED_QA_SESSION';
}
export interface SessionMessages {
  requestId: string;
  // null identifies the encrypted archive, which has no automatic expiry.
  expiresAt: string | null;
  messages: Partial<Record<IsoMessage['mti'], SessionIsoMessage>>;
}
