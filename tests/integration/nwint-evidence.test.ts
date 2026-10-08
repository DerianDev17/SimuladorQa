import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { NwintEvidenceInspector } from '../../apps/desktop/src/main/adapters/nwint-evidence-inspector';
import { removeTestDirectory } from '../helpers/temporary-directory';

it('reads a local log and keeps raw/private records out of the report', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nwint-evidence-'));
  try {
    const path = join(directory, 'synthetic.out');
    await writeFile(
      path,
      '16:00:01.000000|   opened\norg_pid = 80131\tmsgtype = 200\ndest_pid = 82052\n16:00:02.000000|   Field: #011\n 6,[008103]\nSVT_RAW_DATA PRIVATE_TEST_PAYLOAD',
    );
    const report = new NwintEvidenceInspector().inspect(await readFile(path, 'utf8'));
    expect(report.originPids).toEqual([80131]);
    expect(report.destinationPids).toEqual([82052]);
    expect(report.messageTypes).toEqual([200]);
    expect(report.stanObservations).toEqual([{ stan: '008103', line: 4 }]);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_TEST_PAYLOAD');
  } finally {
    await removeTestDirectory(directory, 'nwint-evidence-');
  }
});

it('reports unavailable review inputs with a fixed error and no private path', async () => {
  const error = await promisify(execFile)(process.execPath, [
    'tooling/review-cb-evidence.mjs',
    'PRIVATE_SOURCE_PATH',
  ]).catch((failure: unknown) => failure);
  expect(error).toMatchObject({
    code: 1,
    stdout: '',
    stderr: expect.stringContaining('CB_EVIDENCE_REVIEW_INCOMPLETE'),
  });
  expect((error as { stderr: string }).stderr).not.toContain('PRIVATE_SOURCE_PATH');
});
