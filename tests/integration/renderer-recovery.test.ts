import { describe, expect, it, vi } from 'vitest';
import { RendererRecoveryService } from '../../apps/desktop/src/main/renderer-recovery-service';
import { approvedWithdrawalExecution } from '../helpers/withdrawal';
import { DesktopClient } from '../../apps/desktop/src/renderer/desktop-client';
import type { DesktopApi } from '../../packages/shared/src/contracts';

const preferences = {
  read: async () => ({ version: 1 as const, environment: 'QA' as const, audit: [] }),
};
describe('recuperación del Renderer sin envíos', () => {
  it('impide recuperar con una operación activa y entrega únicamente referencias al terminar', async () => {
    let busy = true;
    const record = approvedWithdrawalExecution();
    const history = vi.fn(async () => ({ ok: true as const, value: [record] }));
    const service = new RendererRecoveryService(() => busy, [{ history }], preferences);
    expect(await service.inspect(undefined)).toEqual({
      ok: true,
      value: { busy: true, recent: [] },
    });
    expect(history).not.toHaveBeenCalled();
    busy = false;
    expect(await service.inspect(undefined)).toEqual({
      ok: true,
      value: {
        busy: false,
        recent: [
          { requestId: record.requestId, outcome: record.outcome, startedAt: record.startedAt },
        ],
      },
    });
  });
  it('vuelve a comprobar actividad después de consultar y falla cerrado ante error o payload ajeno', async () => {
    let busy = false;
    const service = new RendererRecoveryService(
      () => busy,
      [
        {
          history: async () => {
            busy = true;
            return { ok: true, value: [] };
          },
        },
      ],
      preferences,
    );
    expect(await service.inspect(undefined)).toMatchObject({ ok: true, value: { busy: true } });
    expect(await service.inspect({ retry: true })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    const failed = new RendererRecoveryService(
      () => false,
      [
        {
          history: async () => {
            throw Error('private');
          },
        },
      ],
      preferences,
    );
    const result = await failed.inspect(undefined);
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('el consumidor limita la espera sin repetir comandos cuando Main no responde', async () => {
    const getRendererRecovery = vi.fn(() => new Promise<never>(() => {}));
    const client = new DesktopClient({ getRendererRecovery } as unknown as DesktopApi, 10);
    expect(await client.call((api) => api.getRendererRecovery())).toMatchObject({
      ok: false,
      error: { code: 'TIMEOUT' },
    });
    expect(getRendererRecovery).toHaveBeenCalledOnce();
  });
});
