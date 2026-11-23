import { _electron as electron } from '@playwright/test';
import { resolve } from 'node:path';

export function electronEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && entry[0] !== 'ELECTRON_RUN_AS_NODE',
    ),
  );
}

export function launchTestDesktop(directory: string, extraArgs: readonly string[] = []) {
  return electron.launch({
    args: [
      resolve('dist/main.cjs'),
      `--user-data-dir=${directory}`,
      '--simulate-reader',
      ...extraArgs,
    ],
    env: electronEnvironment(),
  });
}
