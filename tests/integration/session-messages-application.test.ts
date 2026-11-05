import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { SessionMessageStore } from '../../apps/desktop/src/main/infrastructure/session-message-store';
import { CapturedVisaBalance } from '../../apps/desktop/src/main/adapters/captured-visa-balance';
import type { Preferences } from '../../apps/desktop/src/main/ports';
import { capturedBalanceRequest } from '../helpers/captured-visa-balance';

describe('acceso a diagnóstico de sesión desde aplicación', () => {
  it('valida UUID/QA/atributos y retira los mensajes al cambiar de ambiente', async () => {
    let preferences: Preferences = { version: 1, environment: 'QA', audit: [] };
    const store = new SessionMessageStore();
    const application = new DesktopApplication(
      {
        read: async () => preferences,
        write: async (next) => {
          preferences = next;
        },
      },
      {
        agentId: randomUUID(),
        hostname: 'test',
        user: 'test',
        version: 'test',
        uuid: randomUUID,
        now: () => new Date().toISOString(),
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      store,
    );
    const requestId = randomUUID();
    try {
      for (const payload of [
        null,
        { environment: 'PROD', requestId },
        { environment: 'QA', requestId: 'invalid' },
        { environment: 'QA', requestId, extra: true },
      ])
        expect(await application.getSessionMessages(payload)).toMatchObject({
          ok: false,
          error: { code: 'VALIDATION_ERROR' },
        });
      expect(await application.getSessionMessages({ environment: 'QA', requestId })).toEqual({
        ok: true,
        value: null,
      });
      store.capture(requestId, new CapturedVisaBalance().sessionMessage(capturedBalanceRequest()));
      const result = await application.getSessionMessages({ environment: 'QA', requestId });
      expect(result.ok && !!result.value?.messages['0200']).toBe(true);
      expect(JSON.stringify(preferences).includes('411111' + '0'.repeat(10))).toBe(false);
      await application.setEnvironment({ environment: 'PREPROD' });
      expect(store.read(requestId)).toBeNull();
      expect(await application.getSessionMessages({ environment: 'QA', requestId })).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT' },
      });
      await application.setEnvironment({ environment: 'QA' });
      expect(await application.getSessionMessages({ environment: 'QA', requestId })).toEqual({
        ok: true,
        value: null,
      });
    } finally {
      store.clear();
    }
  });
});
