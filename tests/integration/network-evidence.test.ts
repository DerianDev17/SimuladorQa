import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { FileNetworkEvidence } from '../../apps/desktop/src/main/adapters/file-network-evidence';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { FilePreferencesStore } from '../../apps/desktop/src/main/infrastructure/preferences-store';
import { networkEvidence } from '../helpers/network-evidence';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('evidencia privada cargada en Main', () => {
  let directory: string;
  let file: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-network-'));
    file = join(directory, 'network-evidence.json');
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-network-');
  });
  it('carga UTF8/BOM y aísla la topología por ambiente y copia', async () => {
    const evidence = networkEvidence();
    await writeFile(file, '\uFEFF' + JSON.stringify(evidence));
    const catalog = await FileNetworkEvidence.load(file);
    expect(catalog.forEnvironment('QA')).toEqual({ status: 'DOCUMENTED', evidence });
    const copy = catalog.forEnvironment('QA');
    if (copy.status === 'DOCUMENTED') copy.evidence.environment = 'PREPROD';
    expect(catalog.forEnvironment('PREPROD')).toEqual({ status: 'NOT_CONFIGURED' });
    expect(catalog.forEnvironment('QA')).toEqual({ status: 'DOCUMENTED', evidence });
  });
  it('controla fuente ausente y error de I/O sin exponer rutas', async () => {
    expect((await FileNetworkEvidence.load(file)).forEnvironment('QA')).toEqual({
      status: 'NOT_CONFIGURED',
    });
    const failed = (await FileNetworkEvidence.load(directory)).forEnvironment('QA');
    expect(failed).toEqual({ status: 'UNAVAILABLE' });
    expect(JSON.stringify(failed)).not.toContain(directory);
  });
  it('rechaza corrupción, campos sensibles, PROD y exceso de bytes sin alterar archivos', async () => {
    for (const source of [
      '{private-secret',
      JSON.stringify({ ...networkEvidence(), password: 'private-secret' }),
      JSON.stringify({ ...networkEvidence(), environment: 'PROD' }),
      ' '.repeat(8193),
    ]) {
      await writeFile(file, source);
      expect((await FileNetworkEvidence.load(file)).forEnvironment('QA')).toEqual({
        status: 'UNAVAILABLE',
      });
      expect(await readFile(file, 'utf8')).toBe(source);
    }
  });
  it('snapshot documental conserva bloqueos reales y oculta datos QA al pasar a PREPROD', async () => {
    const evidence = networkEvidence();
    await writeFile(file, JSON.stringify(evidence));
    const catalog = await FileNetworkEvidence.load(file);
    const app = new DesktopApplication(
      new FilePreferencesStore(join(directory, 'preferences.json')),
      {
        agentId: randomUUID(),
        hostname: 'test',
        user: 'test',
        version: 'test',
        uuid: randomUUID,
        now: () => '2026-10-07T15:00:00.000Z',
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      catalog,
    );
    expect(await app.getSnapshot()).toMatchObject({
      ok: true,
      value: {
        environment: 'QA',
        connection: 'NOT_CONFIGURED',
        networkEvidence: { status: 'DOCUMENTED', evidence },
      },
    });
    expect(await app.prepare({ transaction: 'BALANCE', scenario: 'LOCAL' })).toMatchObject({
      ok: true,
      value: { status: 'BLOCKED' },
    });
    expect(await app.setEnvironment({ environment: 'PREPROD' })).toMatchObject({
      ok: true,
      value: { networkEvidence: { status: 'NOT_CONFIGURED' } },
    });
    expect(await app.setEnvironment({ environment: 'QA' })).toMatchObject({
      ok: true,
      value: { networkEvidence: { status: 'DOCUMENTED', evidence } },
    });
  });
});
