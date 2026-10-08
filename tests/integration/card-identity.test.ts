import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WindowsCardSession } from '../../apps/desktop/src/main/adapters/windows-card-session';
import { CardIdentityService } from '../../apps/desktop/src/main/card-identity-service';
import type { CardReaderAdapter } from '../../packages/domain/src/card-reader';
import { identityResponses, syntheticPan } from '../helpers/card-identity';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe.skipIf(process.platform !== 'win32')('lectura EMV con proceso PC/SC sintético', () => {
  let directory: string;
  let script: string;
  const reader: CardReaderAdapter = {
    inspect: async () => ({
      checkedAt: new Date().toISOString(),
      identityStatus: 'NOT_READ',
      readers: [{ name: 'CI Reader', state: 'CARD_PRESENT', atr: '3B00' }],
    }),
  };
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coonecta-card-identity-'));
    script = join(directory, 'card.ps1');
  });
  afterEach(async () => {
    await removeTestDirectory(directory, 'coonecta-card-identity-');
  });
  const connect = async () => {
    const session = new WindowsCardSession(script);
    try {
      await session.open('CI Reader');
      return session;
    } catch (error) {
      session.close();
      throw error;
    }
  };

  it('pasa APDU por stdin y entrega solamente la proyección protegida al IPC', async () => {
    const replies = identityResponses().map((row) =>
      Buffer.from(row).toString('hex').toUpperCase(),
    );
    await writeFile(
      script,
      `
$rows = '${JSON.stringify(replies)}' | ConvertFrom-Json
$index = 0
while ($null -ne ($line = [Console]::ReadLine())) {
  $request = $line | ConvertFrom-Json
  if ($request.op -eq 'close') { break }
  if ($request.op -eq 'transmit') { @{ok=$true;response=$rows[$index]} | ConvertTo-Json -Compress; $index++ }
  elseif ($request.op -eq 'status') { @{ok=$true;valid=$true} | ConvertTo-Json -Compress }
  else { @{ok=$true} | ConvertTo-Json -Compress }
}`,
    );
    const service = new CardIdentityService(reader, connect);
    try {
      const result = await service.read({ readerName: 'CI Reader' });
      expect(result).toMatchObject({
        ok: true,
        value: { status: 'READ', expiry: '12/29', panMasked: '*'.repeat(12) + '4444' },
      });
      expect(JSON.stringify(result).includes(syntheticPan)).toBe(false);
      expect(result).not.toHaveProperty('response');
      expect(await service.current()).toMatchObject({ cardholderName: 'QA TESTER' });
    } finally {
      service.close();
    }
  });
  it('limita dependencia bloqueada y no expone salida inválida o stderr', async () => {
    await writeFile(script, 'Start-Sleep -Seconds 30');
    const blocked = new WindowsCardSession(script, 50);
    await expect(blocked.open('CI Reader')).rejects.toThrow('CARD_TIMEOUT');
    await writeFile(
      script,
      "Write-Output 'PRIVATE-RAW'; [Console]::Error.WriteLine('PRIVATE-ERROR')",
    );
    const service = new CardIdentityService(reader, connect);
    try {
      const result = await service.read({ readerName: 'CI Reader' });
      expect(result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      expect(JSON.stringify(result)).not.toContain('PRIVATE');
    } finally {
      service.close();
    }
  });
  it('cierra un intercambio pendiente sin dejar el consumidor esperando', async () => {
    await writeFile(script, '[Console]::ReadLine() | Out-Null; Start-Sleep -Seconds 30');
    const session = new WindowsCardSession(script);
    const pending = session.open('CI Reader');
    session.close();
    await expect(pending).rejects.toThrow('CARD_UNAVAILABLE');
    await expect(session.isValid()).rejects.toThrow('CARD_UNAVAILABLE');
  });
});
