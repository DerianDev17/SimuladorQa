import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileSendConfigurationStore } from '../../apps/desktop/src/main/infrastructure/send-configuration-store';
import { SendConfigurationService } from '../../apps/desktop/src/main/send-configuration-service';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import type { SendConfigurationFile } from '../../packages/domain/src/send-configuration';
import type { PreferencesStore } from '../../apps/desktop/src/main/ports';
import { CmsV36Catalog } from '../../apps/desktop/src/main/adapters/cms-v36-catalog';
import { networkEvidence } from '../helpers/network-evidence';
import { removeTestDirectory } from '../helpers/temporary-directory';

// Filesystem and in-process metadata only: no transport, socket, PC/SC or send method.
describe('configuración real en archivo y preparación Main offline', () => {
  let directory: string;
  let file: string;
  const evidence = networkEvidence();
  const runtime = {
    agentId: randomUUID(),
    hostname: 'synthetic-station',
    user: 'synthetic-user',
    version: '0.1.0',
    uuid: randomUUID,
    now: () => '2026-10-11T22:00:00.000Z',
  };
  const catalog = {
    forEnvironment: (environment: string) =>
      environment === 'QA'
        ? { status: 'DOCUMENTED' as const, evidence: structuredClone(evidence) }
        : { status: 'NOT_CONFIGURED' as const },
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-send-config-'));
    file = join(directory, 'send-configuration.json');
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-send-config-');
  });
  it('persiste fuente, modo, revisión y auditoría sin tramas al reiniciar', async () => {
    const service = new SendConfigurationService(
      new FileSendConfigurationStore(file),
      catalog,
      runtime,
    );
    await service.initializeDocumentedQa();
    const restarted = new SendConfigurationService(
      new FileSendConfigurationStore(file),
      catalog,
      runtime,
    );
    expect(await restarted.read('QA')).toMatchObject({
      ok: true,
      value: {
        status: 'CONFIGURED_BLOCKED',
        configuration: { revision: 1, endpoint: evidence.ingress, connectDeadlineMs: null },
      },
    });
    expect(await restarted.read('PREPROD')).toMatchObject({
      ok: true,
      value: { configuration: null, documentedEndpoint: null },
    });
    const stored: SendConfigurationFile = JSON.parse(await readFile(file, 'utf8'));
    expect(stored.audit).toHaveLength(1);
    expect(Object.keys(stored.configurations[0]!)).not.toContain('wireBytes');
    expect(Object.keys(stored.configurations[0]!)).not.toContain('pan');
  });
  it('conserva archivos corruptos/futuros y rechaza tamaño excesivo', async () => {
    for (const contents of [
      'broken-private',
      JSON.stringify({ version: 9, configurations: [], audit: [] }),
      'x'.repeat(262145),
    ]) {
      await writeFile(file, contents);
      const service = new SendConfigurationService(
        new FileSendConfigurationStore(file),
        catalog,
        runtime,
      );
      expect(await service.initializeDocumentedQa()).toMatchObject({
        ok: false,
        error: { code: 'STORAGE_UNAVAILABLE' },
      });
      expect(await readFile(file, 'utf8')).toBe(contents);
    }
  });
  it('verifica el ambiente y prepara metadatos bloqueados sin generar ni enviar bytes', async () => {
    const service = new SendConfigurationService(
      new FileSendConfigurationStore(file),
      catalog,
      runtime,
    );
    await service.initializeDocumentedQa();
    const preferences: PreferencesStore = {
      read: async () => ({ version: 1, environment: 'QA', audit: [] }),
      write: async () => undefined,
    };
    const application = new DesktopApplication(
      preferences,
      runtime,
      {
        execute: async () => ({
          ok: true,
          value: { environment: 'QA', entities: [], atms: [], cases: [], audit: [] },
        }),
        close: async () => undefined,
      },
      new CmsV36Catalog(),
      undefined,
      undefined,
      undefined,
      catalog,
      undefined,
      service,
    );
    const draft = {
      environment: 'QA',
      transaction: 'BALANCE',
      scenario: 'LOCAL',
      atmId: null,
      atmRevision: null,
      account: 'SAVINGS',
      amount: null,
    };
    const result = await application.prepareSendPlan({ draft, configurationRevision: 1 });
    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'BLOCKED',
        frameGenerated: false,
        transmissionAttempted: false,
        configurationRevision: 1,
        endpoint: evidence.ingress,
      },
    });
    if (result.ok) {
      expect(result.value.planId).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.value.plannedAt).toBe(runtime.now());
      expect(result.value.blockers.map((item) => item.id)).toContain('AUTOMATIC-FRAME-GENERATOR');
    }
    expect(await application.prepareSendPlan({ draft, configurationRevision: 2 })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(
      await application.prepareSendPlan({ draft, configurationRevision: 1, wireBytes: [0] }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(await application.getSendConfiguration({ environment: 'PREPROD' })).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(
      await application.saveSendConfiguration({ environment: 'PROD', revision: null, values: {} }),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });
});
