import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FileQaExecutionProfiles,
  qaExecutionProfileIdentity,
} from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { qaExecutionFixture } from '../helpers/qa-execution';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('reserva persistente de secuencias QA', () => {
  let directory: string, path: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-execution-'));
    path = join(directory, 'profile.json');
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-execution-');
  });
  it('consume una vez y conserva el consumo tras reiniciar', async () => {
    const { input, profile } = qaExecutionFixture();
    await writeFile(path, JSON.stringify(input));
    const signal = new AbortController().signal;
    expect(
      await new FileQaExecutionProfiles(path).reserve(
        profile.id,
        signal,
        qaExecutionProfileIdentity(profile),
      ),
    ).toBe(650101);
    expect(await new FileQaExecutionProfiles(path).reserve(profile.id, signal)).toBe(650102);
    await expect(new FileQaExecutionProfiles(path).reserve(profile.id, signal)).rejects.toThrow(
      'QA_SEQUENCE_UNAVAILABLE',
    );
    expect(
      (await new FileQaExecutionProfiles(path).read()).file.profiles[0]!.reservedSequences,
    ).toEqual([]);
    await expect(access(path + '.lock')).rejects.toThrow();
  });
  it('no consume si se cancelo o cambio el perfil aprobado', async () => {
    const { input, row, profile } = qaExecutionFixture();
    row.timeZone = 'UTC';
    await writeFile(path, JSON.stringify(input));
    const store = new FileQaExecutionProfiles(path);
    await expect(
      store.reserve(profile.id, new AbortController().signal, qaExecutionProfileIdentity(profile)),
    ).rejects.toThrow('QA_PROFILE_CHANGED');
    const abort = new AbortController();
    abort.abort();
    await expect(store.reserve(profile.id, abort.signal)).rejects.toThrow(
      'QA_SEQUENCE_UNAVAILABLE',
    );
    expect((await store.read()).file.profiles[0]!.reservedSequences).toEqual([650101, 650102]);
  });
  it('impide escritores concurrentes sin asignar la misma secuencia', async () => {
    const { input, profile } = qaExecutionFixture();
    await writeFile(path, JSON.stringify(input));
    const store = new FileQaExecutionProfiles(path);
    const results = await Promise.allSettled([
      store.reserve(profile.id, new AbortController().signal),
      store.reserve(profile.id, new AbortController().signal),
    ]);
    expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect((await store.read()).file.profiles[0]!.reservedSequences).toEqual([650102]);
  });
  it('rechaza archivos ausentes, corruptos y sobredimensionados', async () => {
    const store = new FileQaExecutionProfiles(path);
    await expect(store.read()).rejects.toThrow();
    await writeFile(path, 'invalid');
    await expect(store.read()).rejects.toThrow();
    await writeFile(path, Buffer.alloc(65537, 32));
    await expect(store.read()).rejects.toThrow('QA_PROFILE_INVALID');
  });
});
