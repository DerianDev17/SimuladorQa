import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  parseSaveSendConfiguration,
  parseSendConfigurationFile,
  sendConfigurationSnapshot,
} from '../../packages/domain/src/send-configuration';
import type {
  SendConfiguration,
  SendConfigurationFile,
} from '../../packages/domain/src/send-configuration';
import { SendConfigurationService } from '../../apps/desktop/src/main/send-configuration-service';
import type { SendConfigurationStore } from '../../apps/desktop/src/main/send-configuration-port';
import { networkEvidence } from '../helpers/network-evidence';

const evidence = networkEvidence();
const values = {
  evidenceId: evidence.id,
  trigger: 'ON_CLICK' as const,
  connectDeadlineMs: null,
  observationWindowMs: null,
};
const runtime = {
  agentId: randomUUID(),
  hostname: 'synthetic-station',
  user: 'synthetic-user',
  version: '0.1.0',
  uuid: randomUUID,
  now: () => '2026-10-11T22:00:00.000Z',
};
const configuration: SendConfiguration = {
  ...values,
  id: randomUUID(),
  environment: 'QA',
  revision: 1,
  updatedAt: runtime.now(),
  endpoint: { ...evidence.ingress },
};
function fixture() {
  let file: SendConfigurationFile = { version: 1, configurations: [], audit: [] };
  const store: SendConfigurationStore = {
    read: async () => structuredClone(file),
    write: async (value) => {
      file = structuredClone(value);
    },
  };
  const service = new SendConfigurationService(
    store,
    {
      forEnvironment: (environment) =>
        environment === evidence.environment
          ? { status: 'DOCUMENTED', evidence: structuredClone(evidence) }
          : { status: 'NOT_CONFIGURED' },
    },
    runtime,
  );
  return { service, store, getFile: () => structuredClone(file) };
}

describe('configuración y preparación offline, sin envío', () => {
  it('proyecta auditoría por ambiente, reciente primero, acotada y sin referencias mutables', () => {
    const entries = Array.from({ length: 105 }, (_, index) => ({
      id: randomUUID(),
      timestamp: runtime.now(),
      environment: 'QA' as const,
      configurationId: configuration.id,
      revision: index + 1,
      user: runtime.user,
      machine: runtime.hostname,
      settings: {
        endpoint: { ...evidence.ingress },
        connectDeadlineMs: 1000,
        observationWindowMs: 2000,
      },
    }));
    const other = { ...entries[0]!, id: randomUUID(), environment: 'PREPROD' as const };
    const snapshot = sendConfigurationSnapshot('QA', configuration, evidence, [...entries, other]);
    expect(snapshot.audit).toHaveLength(100);
    expect(snapshot.audit[0]?.revision).toBe(105);
    expect(snapshot.audit.at(-1)?.revision).toBe(6);
    expect(snapshot.audit.every((entry) => entry.environment === 'QA')).toBe(true);
    snapshot.audit[0]!.settings!.endpoint.port = 1;
    expect(entries.at(-1)?.settings.endpoint.port).toBe(evidence.ingress.port);
    expect(sendConfigurationSnapshot('QA', configuration, evidence).audit).toEqual([]);
  });
  it('lee auditoría histórica y rechaza detalles inválidos o campos no permitidos', () => {
    const entry = {
      id: randomUUID(),
      timestamp: runtime.now(),
      environment: 'QA',
      configurationId: configuration.id,
      revision: 1,
      user: runtime.user,
      machine: runtime.hostname,
    };
    const file = { version: 1, configurations: [configuration], audit: [entry] };
    expect(parseSendConfigurationFile(file)?.audit[0]?.settings).toBeUndefined();
    const settings = {
      endpoint: { ...evidence.ingress },
      connectDeadlineMs: 1000,
      observationWindowMs: null,
    };
    expect(parseSendConfigurationFile({ ...file, audit: [{ ...entry, settings }] })).toBeDefined();
    for (const invalid of [
      null,
      {},
      { ...settings, connectDeadlineMs: 0 },
      { ...settings, endpoint: { host: 'invalid', port: 1 } },
      { ...settings, unexpected: 'private' },
      { ...settings, observationWindowMs: '1000' },
    ])
      expect(
        parseSendConfigurationFile({ ...file, audit: [{ ...entry, settings: invalid }] }),
      ).toBeUndefined();
  });
  it('guarda un destino operativo sin evidencia y conserva la revisión y auditoría', async () => {
    const { store, getFile } = fixture();
    const service = new SendConfigurationService(
      store,
      {
        forEnvironment: () => ({ status: 'NOT_CONFIGURED' }),
      },
      runtime,
    );
    const request = {
      environment: 'QA',
      revision: null,
      endpoint: { host: '127.0.0.1', port: 16101 },
      values: { ...values, evidenceId: null, connectDeadlineMs: 1234, observationWindowMs: 4321 },
    };
    expect(await service.save(request)).toMatchObject({
      ok: true,
      value: {
        status: 'CONFIGURED_BLOCKED',
        documentedEndpoint: null,
        configuration: { endpoint: request.endpoint, evidenceId: null, revision: 1 },
      },
    });
    expect(parseSendConfigurationFile(getFile())).toBeDefined();
    expect(getFile().audit).toHaveLength(1);
    expect(await service.save(request)).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    store.write = async () => {
      throw Error('PRIVATE_PATH');
    };
    const failed = await service.save({ ...request, revision: 1 });
    expect(failed).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(failed)).not.toContain('PRIVATE_PATH');
    expect(getFile().configurations[0]?.revision).toBe(1);
  });
  it('valida el destino operativo y no permite atribuirlo a una fuente documental', () => {
    const request = {
      environment: 'QA',
      revision: null,
      endpoint: { host: '127.0.0.1', port: 16101 },
      values: { ...values, evidenceId: null },
    };
    expect(parseSaveSendConfiguration(request)).toEqual(request);
    for (const endpoint of [
      { host: '999.0.0.1', port: 16101 },
      { host: '01.0.0.1', port: 16101 },
      { host: 'host/path', port: 16101 },
      { host: '127.0.0.1', port: 0 },
      { host: '127.0.0.1', port: 65536 },
      { host: '127.0.0.1', port: 1.5 },
      { host: '127.0.0.1', port: '16101' },
      { host: '127.0.0.1', port: 1, secret: 'private' },
    ])
      expect(parseSaveSendConfiguration({ ...request, endpoint })).toBeUndefined();
    for (const invalid of [
      { ...request, environment: 'PROD' },
      { ...request, environment: 'PREPROD' },
      { ...request, values },
      { ...request, values: { ...request.values, trigger: 'AFTER_REVIEW' } },
      { environment: 'QA', revision: null, values: request.values },
    ])
      expect(parseSaveSendConfiguration(invalid)).toBeUndefined();
  });
  it('acepta plazos pendientes y modos previstos sin fabricar reglas del proveedor', () => {
    expect(parseSaveSendConfiguration({ environment: 'QA', revision: null, values })).toBeDefined();
    expect(
      parseSaveSendConfiguration({
        environment: 'PREPROD',
        revision: 1,
        values: {
          ...values,
          trigger: 'AFTER_REVIEW',
          connectDeadlineMs: 1000,
          observationWindowMs: 2000,
        },
      }),
    ).toBeDefined();
  });
  it.each([0, -1, 1.5, 30001, NaN, Infinity, '1000'])(
    'rechaza plazo inválido: %s',
    (connectDeadlineMs) => {
      expect(
        parseSaveSendConfiguration({
          environment: 'QA',
          revision: null,
          values: { ...values, connectDeadlineMs },
        }),
      ).toBeUndefined();
    },
  );
  it('rechaza PROD, modo desconocido, identidad falsa, bytes y secretos por el contrato', () => {
    for (const request of [
      { environment: 'PROD', revision: null, values },
      { environment: 'QA', revision: null, values: { ...values, trigger: 'AT_STARTUP' } },
      { environment: 'QA', revision: null, values: { ...values, evidenceId: 'invalid' } },
      { environment: 'QA', revision: null, values, wireBytes: [0] },
      { environment: 'QA', revision: null, values: { ...values, pin: 'private' } },
    ])
      expect(parseSaveSendConfiguration(request)).toBeUndefined();
  });
  it('no presenta un destino documentado o plazos técnicos como envío habilitado', () => {
    const status = sendConfigurationSnapshot(
      'QA',
      { ...configuration, connectDeadlineMs: 1000, observationWindowMs: 1000 },
      evidence,
    );
    expect(status.status).toBe('CONFIGURED_BLOCKED');
    expect(status.pending.map((item) => item.id)).toContain('AUTOMATIC-FRAME-GENERATOR');
    expect(status.pending.map((item) => item.id)).toContain('CARD-TRANSACTION-SECURITY');
  });
  it('invalida un destino modificado y no hereda evidencia QA en PREPROD', () => {
    expect(
      sendConfigurationSnapshot('QA', configuration, {
        ...evidence,
        ingress: { ...evidence.ingress, port: 16101 },
      }).status,
    ).toBe('SOURCE_CHANGED');
    expect(sendConfigurationSnapshot('PREPROD', undefined, evidence).documentedEndpoint).toBeNull();
  });
  it('inicializa QA una sola vez desde evidencia, sin plazos inventados ni activar envío', async () => {
    const { service, getFile } = fixture();
    const first = await service.initializeDocumentedQa();
    expect(first).toMatchObject({
      ok: true,
      value: {
        status: 'CONFIGURED_BLOCKED',
        configuration: {
          environment: 'QA',
          revision: 1,
          connectDeadlineMs: null,
          observationWindowMs: null,
          endpoint: evidence.ingress,
        },
      },
    });
    await service.initializeDocumentedQa();
    expect(getFile().audit).toHaveLength(1);
    expect(getFile().audit[0]).toMatchObject({
      user: runtime.user,
      machine: runtime.hostname,
      timestamp: runtime.now(),
    });
    expect(parseSendConfigurationFile(getFile())).toBeDefined();
  });
  it('guarda una revisión y rechaza escritura obsoleta o evidencia cambiada', async () => {
    const { service, getFile } = fixture();
    await service.initializeDocumentedQa();
    expect(
      await service.save({
        environment: 'QA',
        revision: 1,
        values: { ...values, trigger: 'AFTER_REVIEW', connectDeadlineMs: 1000 },
      }),
    ).toMatchObject({
      ok: true,
      value: { configuration: { revision: 2, trigger: 'AFTER_REVIEW' } },
    });
    expect(await service.save({ environment: 'QA', revision: 1, values })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(
      await service.save({
        environment: 'QA',
        revision: 2,
        values: { ...values, evidenceId: randomUUID() },
      }),
    ).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(getFile().audit).toHaveLength(2);
  });
  it('no escribe cuando no existe evidencia y protege fallos de almacenamiento', async () => {
    const { service, store, getFile } = fixture();
    expect(await service.save({ environment: 'PREPROD', revision: null, values })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(getFile().configurations).toHaveLength(0);
    store.read = async () => {
      throw Error('PRIVATE_PATH');
    };
    const failed = await service.initializeDocumentedQa();
    expect(failed).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(failed)).not.toContain('PRIVATE_PATH');
  });
  it('rechaza archivos con campos extra, perfiles duplicados y auditoría inválida', () => {
    const file = { version: 1, configurations: [configuration], audit: [] };
    expect(parseSendConfigurationFile(file)).toBeDefined();
    for (const changed of [
      { ...file, raw: 'private' },
      { ...file, configurations: [configuration, configuration] },
      { ...file, configurations: [{ ...configuration, environment: 'PROD' }] },
      {
        ...file,
        configurations: [{ ...configuration, endpoint: { host: 'invalid', port: 16100 } }],
      },
      { ...file, audit: [{ id: randomUUID() }] },
    ])
      expect(parseSendConfigurationFile(changed)).toBeUndefined();
  });
});
