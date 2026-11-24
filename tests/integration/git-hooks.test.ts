import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { removeTestDirectory } from '../helpers/temporary-directory';

const exec = promisify(execFile);

it.each([0, 23, 127])('el hook invoca la validación y propaga su resultado (%s)', async (code) => {
  const directory = await mkdtemp(join(tmpdir(), 'coonecta-git-hook-'));
  try {
    const bin = join(directory, 'bin');
    const argumentsFile = join(directory, 'arguments.txt');
    await mkdir(bin);
    // Exercise Git's actual hook dispatch without rerunning the full suite inside itself.
    await writeFile(
      join(bin, 'npm'),
      '#!/bin/sh\nprintf "%s\\n" "$@" > "$HOOK_ARGS_FILE"\nexit "$HOOK_TEST_EXIT_CODE"\n',
      { mode: 0o755 },
    );
    // A pre-commit invocation can export GIT_DIR/GIT_INDEX_FILE for its own repo.
    // Do not let those variables redirect commands intended for the temporary repo.
    const environment = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([key]) => key.toLowerCase() !== 'path' && !key.toUpperCase().startsWith('GIT_'),
        ),
      ),
      PATH: process.env.PATH ?? '',
    };
    const options = { timeout: 10_000, windowsHide: true, env: environment };
    await exec('git', ['-c', 'init.templateDir=', 'init', '--quiet', directory], options);
    await exec(
      'git',
      ['-C', directory, 'config', '--local', 'core.hooksPath', resolve('.githooks')],
      options,
    );
    const result = await exec('git', ['-C', directory, 'hook', 'run', 'pre-commit'], {
      ...options,
      env: {
        ...environment,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ''}`,
        HOOK_ARGS_FILE: argumentsFile.replaceAll('\\', '/'),
        HOOK_TEST_EXIT_CODE: String(code),
      },
    }).then(
      () => true,
      () => false,
    );
    expect(await readFile(argumentsFile, 'utf8')).toBe('run\ncheck:commit\n');
    expect(result).toBe(code === 0);
  } finally {
    await removeTestDirectory(directory, 'coonecta-git-hook-');
  }
});
