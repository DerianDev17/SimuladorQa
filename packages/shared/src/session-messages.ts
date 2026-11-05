import type { IsoMessage } from '../../domain/src/iso-message';

// Explicitly separate from durable/public messages. Never persist this DTO.
export interface SessionIsoMessage extends IsoMessage {
  visibility: 'UNMASKED_QA_SESSION';
}
export interface SessionMessages {
  requestId: string;
  expiresAt: string;
  messages: Partial<Record<IsoMessage['mti'], SessionIsoMessage>>;
}
