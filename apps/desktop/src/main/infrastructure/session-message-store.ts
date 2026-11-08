import { isUuid } from '../../../../../packages/domain/src/catalogs';
import type {
  SessionIsoMessage,
  SessionMessages,
} from '../../../../../packages/shared/src/session-messages';
import type { SessionMessagePort } from '../session-message-port';

export const sessionMessageLifetimeMs = 15 * 60 * 1000;
// Bounded, volatile QA diagnostics; no disk, logging or journal dependency.
export class SessionMessageStore implements SessionMessagePort {
  private readonly entries = new Map<
    string,
    { value: SessionMessages; timer: ReturnType<typeof setTimeout> }
  >();

  capture(requestId: string, message: SessionIsoMessage): void {
    if (!isUuid(requestId) || message.visibility !== 'UNMASKED_QA_SESSION') return;
    let entry = this.entries.get(requestId);
    if (!entry) {
      while (this.entries.size >= 20) this.remove(this.entries.keys().next().value!);
      const timer = setTimeout(() => this.remove(requestId), sessionMessageLifetimeMs);
      timer.unref();
      entry = {
        value: {
          requestId,
          expiresAt: new Date(Date.now() + sessionMessageLifetimeMs).toISOString(),
          messages: {},
        },
        timer,
      };
      this.entries.set(requestId, entry);
    }
    entry.value.messages[message.mti] = structuredClone(message);
  }

  read(requestId: string): SessionMessages | null {
    const entry = this.entries.get(requestId);
    if (!entry) return null;
    if (Date.parse(entry.value.expiresAt) <= Date.now()) {
      this.remove(requestId);
      return null;
    }
    return structuredClone(entry.value);
  }

  private remove(requestId: string): void {
    const entry = this.entries.get(requestId);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(requestId);
  }

  clear(): void {
    for (const id of this.entries.keys()) this.remove(id);
  }
}
