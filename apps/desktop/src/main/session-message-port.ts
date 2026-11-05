import type {
  SessionIsoMessage,
  SessionMessages,
} from '../../../../packages/shared/src/session-messages';

export interface SessionMessagePort {
  capture(requestId: string, message: SessionIsoMessage): void;
  read(requestId: string): SessionMessages | null;
  clear(): void;
}
