import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { SendConfigurationService } from '../../apps/desktop/src/main/send-configuration-service';
import { QaSwitchConnection } from '../../apps/desktop/src/main/adapters/qa-switch-connection';
import type { Preferences } from '../../apps/desktop/src/main/ports';
import type { SendConfigurationFile } from '../../packages/domain/src/send-configuration';
import { networkEvidence } from '../helpers/network-evidence';

async function fixture() {
  let preferences: Preferences = { version: 1, environment: 'QA', audit: [] };
  let file: SendConfigurationFile = { version: 1, configurations: [], audit: [] };
  const evidence = networkEvidence();
  const catalog = { forEnvironment: () => ({ status: 'DOCUMENTED' as const, evidence }) };
  const runtime = {
    agentId: randomUUID(),
    hostname: 'test',
    user: 'test',
    version: 'test',
    uuid: randomUUID,
    now: () => new Date().toISOString(),
  };
  const setup = new SendConfigurationService(
    {
      read: async () => structuredClone(file),
      write: async (value) => {
        file = structuredClone(value);
      },
    },
    catalog,
    runtime,
  );
  await setup.initializeDocumentedQa();
  const configure = () =>
    setup.save({
      environment: 'QA',
      revision: 1,
      values: {
        evidenceId: evidence.id,
        trigger: 'ON_CLICK',
        connectDeadlineMs: 5000,
        observationWindowMs: null,
      },
    });
  const connection = new QaSwitchConnection();
  const connect = vi.spyOn(connection, 'connect').mockImplementation(() => {});
  const disconnect = vi.spyOn(connection, 'disconnect').mockImplementation(() => {});
  const app = new DesktopApplication(
    {
      read: async () => structuredClone(preferences),
      write: async (value) => {
        preferences = structuredClone(value);
      },
    },
    runtime,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    catalog,
    undefined,
    setup,
    undefined,
    connection,
  );
  return { app, evidence, connect, disconnect, configure, setup, connection };
}
describe('conexión por Main con destino derivado de configuración', () => {
  it('conecta sin llave/lector/perfil financiero y solo usa el endpoint documentado', async () => {
    const { app, configure, evidence, connect, disconnect } = await fixture();
    await configure();
    expect(await app.switchConnectionAction('connect', { environment: 'QA' })).toMatchObject({
      ok: true,
    });
    expect(connect).toHaveBeenCalledExactlyOnceWith({
      environment: 'QA',
      endpoint: evidence.ingress,
      connectDeadlineMs: 5000,
    });
    expect(await app.switchConnectionAction('disconnect', { environment: 'QA' })).toMatchObject({
      ok: true,
    });
    expect(disconnect).toHaveBeenCalledWith('USER_DISCONNECTED');
  });
  it('consultar estado no abre red; exige plazo/configuración vigente para conectar', async () => {
    const { app, configure, evidence, connect } = await fixture();
    expect(await app.switchConnectionAction('status', { environment: 'QA' })).toMatchObject({
      ok: true,
      value: { state: 'DISCONNECTED' },
    });
    expect(await app.switchConnectionAction('connect', { environment: 'QA' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    await configure();
    evidence.ingress.port++;
    expect(await app.switchConnectionAction('connect', { environment: 'QA' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it('rechaza producción, destino arbitrario y ambiente obsoleto antes de abrir socket', async () => {
    const { app, configure, connect, disconnect } = await fixture();
    await configure();
    for (const payload of [
      null,
      { environment: 'PROD' },
      { environment: 'PREPROD' },
      { environment: 'QA', endpoint: { host: '127.0.0.1', port: 1 } },
    ])
      expect(await app.switchConnectionAction('connect', payload)).toMatchObject({
        ok: false,
        error: { code: 'FORBIDDEN' },
      });
    await app.setEnvironment({ environment: 'PREPROD' });
    expect(disconnect).toHaveBeenCalledWith('ENVIRONMENT_CHANGED');
    expect(await app.switchConnectionAction('connect', { environment: 'QA' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it('devuelve error seguro cuando el adaptador no está disponible', async () => {
    const { app, configure, connect } = await fixture();
    await configure();
    connect.mockImplementation(() => {
      throw Error('PRIVATE_ADAPTER_DETAILS');
    });
    const result = await app.switchConnectionAction('connect', { environment: 'QA' });
    expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('PRIVATE_ADAPTER_DETAILS');
  });
});
