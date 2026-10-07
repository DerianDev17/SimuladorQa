import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesktopApplication } from '../../apps/desktop/src/main/application';
import { FilePreferencesStore } from '../../apps/desktop/src/main/infrastructure/preferences-store';
import type { RuntimeIdentity } from '../../apps/desktop/src/main/ports';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('aplicación con almacenamiento real', () => {
  let directory: string;
  let file: string;
  let application: DesktopApplication;
  const identity: RuntimeIdentity = {
    agentId: randomUUID(),
    hostname: 'test-station',
    user: 'test-user',
    version: '0.1.0',
    uuid: randomUUID,
    now: () => '2026-10-06T12:00:00.000Z',
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-integration-'));
    file = join(directory, 'preferences.json');
    application = new DesktopApplication(new FilePreferencesStore(file), identity);
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-integration-');
  });

  it('inicia en QA sin depender de una base de datos, lector o red', async () => {
    const result = await application.getSnapshot();
    expect(result).toMatchObject({
      ok: true,
      value: {
        environment: 'QA',
        reader: 'NOT_CONFIGURED',
        connection: 'NOT_CONFIGURED',
        audit: [],
      },
    });
  });
  it('persiste ambiente y auditoría con UUID y UTC al reiniciar', async () => {
    expect(await application.setEnvironment({ environment: 'PREPROD' })).toMatchObject({
      ok: true,
      value: { environment: 'PREPROD' },
    });
    const restarted = new DesktopApplication(new FilePreferencesStore(file), identity);
    const result = await restarted.getSnapshot();
    expect(result).toMatchObject({
      ok: true,
      value: {
        environment: 'PREPROD',
        audit: [
          {
            previousEnvironment: 'QA',
            environment: 'PREPROD',
            timestamp: identity.now(),
            user: 'test-user',
            machine: 'test-station',
          },
        ],
      },
    });
    if (result.ok) expect(result.value.audit[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('rechaza producción y claves adicionales antes de escribir', async () => {
    for (const payload of [
      { environment: 'PROD' },
      { environment: 'QA', password: 'private-secret' },
      null,
    ]) {
      expect(await application.setEnvironment(payload)).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_ERROR' },
      });
    }
    expect(await application.getSnapshot()).toMatchObject({
      ok: true,
      value: { environment: 'QA', audit: [] },
    });
  });
  it('conserva archivos corruptos y no filtra su contenido', async () => {
    await writeFile(file, '{private-secret');
    const result = await application.getSnapshot();
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect(await application.setEnvironment({ environment: 'PREPROD' })).toMatchObject({
      ok: false,
    });
    expect(await readFile(file, 'utf8')).toBe('{private-secret');
  });
  it('rechaza una configuración persistida que intente habilitar PROD', async () => {
    await writeFile(file, JSON.stringify({ version: 1, environment: 'PROD', audit: [] }));
    expect(await application.getSnapshot()).toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE' },
    });
  });
  it('sanitiza fallos de almacenamiento y conserva el ambiente previo', async () => {
    const preferences = { version: 1 as const, environment: 'QA' as const, audit: [] };
    const unavailable = new DesktopApplication(
      { read: async () => preferences, write: () => Promise.reject(new Error('private-secret')) },
      identity,
    );
    const result = await unavailable.setEnvironment({ environment: 'PREPROD' });
    expect(result).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
    expect(JSON.stringify(result)).not.toContain('private-secret');
    expect(await unavailable.getSnapshot()).toMatchObject({
      ok: true,
      value: { environment: 'QA' },
    });
  });
  it('serializa cambios concurrentes y no duplica auditoría para el mismo ambiente', async () => {
    await Promise.all([
      application.setEnvironment({ environment: 'PREPROD' }),
      application.setEnvironment({ environment: 'QA' }),
      application.setEnvironment({ environment: 'QA' }),
    ]);
    const result = await application.getSnapshot();
    expect(result).toMatchObject({ ok: true, value: { environment: 'QA' } });
    if (result.ok) expect(result.value.audit).toHaveLength(2);
  });
  it('mantiene un límite de 100 cambios de ambiente', async () => {
    for (let index = 0; index < 102; index++)
      await application.setEnvironment({ environment: index % 2 === 0 ? 'PREPROD' : 'QA' });
    const result = await application.getSnapshot();
    if (!result.ok) throw new Error('No se pudo leer el resultado');
    expect(result.value.audit).toHaveLength(100);
  });
  it('prepara el flujo usando el ambiente guardado y bloquea cualquier envío', async () => {
    await application.setEnvironment({ environment: 'PREPROD' });
    expect(await application.prepare({ transaction: 'BALANCE', scenario: 'LOCAL' })).toMatchObject({
      ok: true,
      value: { environment: 'PREPROD', status: 'BLOCKED' },
    });
    expect(await application.prepare({ transaction: 'INVALID', scenario: 'LOCAL' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    await writeFile(file, 'invalid');
    expect(await application.prepare({ transaction: 'BALANCE', scenario: 'LOCAL' })).toMatchObject({
      ok: false,
      error: { code: 'STORAGE_UNAVAILABLE' },
    });
  });
});
