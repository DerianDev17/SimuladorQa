import type {
  SessionIsoMessage,
  SessionMessages,
} from '../../../../packages/shared/src/session-messages';

export interface SessionMessagePort {
  capture(requestId: string, message: SessionIsoMessage): void;
  read(requestId: string): SessionMessages | null | Promise<SessionMessages | null>;
  // Release volatile copies only; never delete archived evidence.
  clear(): void;
}

export interface MessageEncryptionPort {
  encrypt(value: string): Promise<Uint8Array>;
  decrypt(value: Uint8Array): Promise<string>;
}
