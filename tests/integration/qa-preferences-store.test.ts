import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QaPreferencesStore } from '../../apps/desktop/src/main/infrastructure/qa-preferences-store';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('preferencias del único ambiente Qa', () => {
  let directory: string;
  let file: string;
  const identity = {
    agentId: randomUUID(),
    hostname: 'test-station',
    user: 'test-user',
    version: 'test',
    uuid: randomUUID,
    now: () => '2026-11-09T12:00:00.000Z',
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-qa-preferences-'));
    file = join(directory, 'preferences.json');
  });
  afterEach(() => removeTestDirectory(directory, 'coonecta-qa-preferences-'));

  it('inicia en QA sin archivo y conserva preferencias QA', async () => {
    const store = new QaPreferencesStore(file, identity);
    const initial = { version: 1 as const, environment: 'QA' as const, audit: [] };
    expect(await store.read()).toEqual(initial);
    await store.write(initial);
    expect(await store.read()).toEqual(initial);
    expect(await readdir(directory)).toEqual(['preferences.json']);
  });

  it('respalda el original, audita y migra una sola vez incluso con lecturas concurrentes', async () => {
    const original = JSON.stringify({ version: 1, environment: 'PREPROD', audit: [] });
    await writeFile(file, original);
    const store = new QaPreferencesStore(file, identity);
    const results = await Promise.all([store.read(), store.read(), store.read()]);
    expect(results[0]).toMatchObject({
      environment: 'QA',
      audit: [
        {
          environment: 'QA',
          previousEnvironment: 'PREPROD',
          timestamp: identity.now(),
          user: identity.user,
          machine: identity.hostname,
        },
      ],
    });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    const backups = (await readdir(directory)).filter((name) => name.endsWith('.backup.json'));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(directory, backups[0]!), 'utf8')).toBe(original);
    expect(await new QaPreferencesStore(file, identity).read()).toEqual(results[0]);
  });

  it.each(['{private-secret', JSON.stringify({ version: 1, environment: 'PROD', audit: [] })])(
    'no sobrescribe preferencias inválidas',
    async (content) => {
      await writeFile(file, content);
      await expect(new QaPreferencesStore(file, identity).read()).rejects.toThrow();
      expect(await readFile(file, 'utf8')).toBe(content);
    },
  );

  it('rechaza escrituras de otro ambiente', async () => {
    await expect(
      new QaPreferencesStore(file, identity).write({
        version: 1,
        environment: 'PREPROD',
        audit: [],
      }),
    ).rejects.toThrow('VALIDATION_ERROR');
    expect(await readdir(directory)).toEqual([]);
  });

  it('conserva el original si no puede crear el respaldo', async () => {
    const original = JSON.stringify({ version: 1, environment: 'PREPROD', audit: [] });
    await writeFile(file, original);
    const id = randomUUID();
    await writeFile(`${file}.${id}.backup.json`, 'existing-backup');
    await expect(
      new QaPreferencesStore(file, { ...identity, uuid: () => id }).read(),
    ).rejects.toThrow();
    expect(await readFile(file, 'utf8')).toBe(original);
    expect(await readFile(`${file}.${id}.backup.json`, 'utf8')).toBe('existing-backup');
  });
});
