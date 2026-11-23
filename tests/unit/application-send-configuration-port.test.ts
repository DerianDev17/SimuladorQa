import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import type { SendConfigurationPort } from '../../apps/desktop/src/main/send-configuration-port';
import { sendConfigurationSnapshot } from '../../packages/domain/src/send-configuration';
import { failure } from '../../packages/shared/src/contracts';

const runtime = {
  agentId: randomUUID(),
  hostname: 'synthetic-station',
  user: 'synthetic-user',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-11-23T12:00:00.000Z',
};
const preferences = {
  read: async () => ({ version: 1 as const, environment: 'QA' as const, audit: [] }),
  write: async () => undefined,
};
const request = {
  environment: 'QA',
  revision: null,
  endpoint: { host: '127.0.0.1', port: 16102 },
  values: {
    evidenceId: null,
    trigger: 'ON_CLICK',
    connectDeadlineMs: 1000,
    observationWindowMs: 2000,
  },
};
const snapshot = sendConfigurationSnapshot('QA', undefined, undefined, []);

function application(port?: SendConfigurationPort) {
  return new DesktopApplication(
    preferences,
    runtime,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    port,
  );
}
function fixture() {
  const port = {
    read: vi.fn<SendConfigurationPort['read']>().mockResolvedValue({ ok: true, value: snapshot }),
    save: vi.fn<SendConfigurationPort['save']>().mockResolvedValue({ ok: true, value: snapshot }),
  } satisfies SendConfigurationPort;
  return { port, app: application(port) };
}

describe('DesktopApplication depende del puerto de configuración de envío', () => {
  it('consulta y guarda con una implementación que solo ofrece read/save', async () => {
    const { port, app } = fixture();
    expect(await app.getSendConfiguration({ environment: 'QA' })).toEqual({
      ok: true,
      value: snapshot,
    });
    expect(port.read).toHaveBeenCalledExactlyOnceWith('QA');
    expect(await app.saveSendConfiguration(request)).toEqual({ ok: true, value: snapshot });
    expect(port.save).toHaveBeenCalledExactlyOnceWith(request);
  });

  it('valida entradas antes de invocar el puerto', async () => {
    const { port, app } = fixture();
    expect(await app.getSendConfiguration({ environment: 'PROD' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(await app.saveSendConfiguration({ ...request, wireBytes: [0] })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(port.read).not.toHaveBeenCalled();
    expect(port.save).not.toHaveBeenCalled();
  });

  it.each(['STORAGE_UNAVAILABLE', 'TIMEOUT'] as const)(
    'propaga %s sin reintentar lecturas ni escrituras',
    async (code) => {
      const { port, app } = fixture();
      const unavailable = failure(code, 'Dependencia de prueba no disponible.');
      port.read.mockResolvedValue(unavailable);
      port.save.mockResolvedValue(unavailable);
      expect(await app.getSendConfiguration({ environment: 'QA' })).toEqual(unavailable);
      expect(await app.saveSendConfiguration(request)).toEqual(unavailable);
      expect(port.read).toHaveBeenCalledTimes(1);
      expect(port.save).toHaveBeenCalledTimes(1);
    },
  );

  it('protege errores inesperados del puerto y permite una consulta posterior', async () => {
    const { port, app } = fixture();
    port.read.mockRejectedValueOnce(new Error('PRIVATE-DETAIL'));
    const result = await app.getSendConfiguration({ environment: 'QA' });
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE-DETAIL');
    expect(await app.getSendConfiguration({ environment: 'QA' })).toMatchObject({ ok: true });
  });

  it('informa dependencia ausente en lectura y guardado', async () => {
    const app = application();
    for (const result of [
      await app.getSendConfiguration({ environment: 'QA' }),
      await app.saveSendConfiguration(request),
    ])
      expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
  });
});
