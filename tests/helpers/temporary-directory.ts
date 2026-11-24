import { rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, resolve } from 'node:path';
import { tmpdir } from 'node:os';

export async function removeTestDirectory(directory: string, prefix: string): Promise<void> {
  const absolute = resolve(directory);
  if (
    !prefix ||
    !isAbsolute(directory) ||
    dirname(absolute) !== resolve(tmpdir()) ||
    !basename(absolute).startsWith(prefix)
  )
    throw new Error('UNSAFE_TEST_DIRECTORY');
  // Windows may briefly retain a PowerShell/SQLite handle after process shutdown.
  // Retry only filesystem cleanup; persistent errors still fail the test.
  await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
