import { join } from 'node:path';
import { EncryptedMessageArchive } from '../../apps/desktop/src/main/infrastructure/encrypted-message-archive';
import { ElectronMessageEncryption } from '../../apps/desktop/src/main/adapters/electron-message-encryption';
import { SqliteBalanceJournal } from '../../apps/desktop/src/main/infrastructure/sqlite-balance-journal';
import type { BalanceExecution } from '../../packages/domain/src/balance-inquiry';
import type { SessionIsoMessage } from '../../packages/shared/src/session-messages';

export async function seed(
  directory: string,
  execution: BalanceExecution,
  messages: SessionIsoMessage[],
): Promise<void> {
  const archive = new EncryptedMessageArchive(
    join(directory, 'qa-message-archive'),
    new ElectronMessageEncryption(),
  );
  const journal = new SqliteBalanceJournal(
    join(directory, 'balance-executions.sqlite'),
    join(directory, 'balance-executions.json'),
  );
  try {
    for (const message of messages) archive.capture(execution.requestId, message);
    await journal.write([execution]);
    // Assert successful encryption, instead of treating a drained failure as saved.
    if (!(await archive.read(execution.requestId))) throw Error('TEST_ARCHIVE_NOT_SAVED');
  } finally {
    await archive.close();
    await journal.close();
  }
}
