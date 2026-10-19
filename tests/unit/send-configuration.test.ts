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
