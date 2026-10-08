import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  WindowsPcscReader,
  inspectReader,
} from '../../apps/desktop/src/main/adapters/windows-pcsc-reader';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe.skipIf(process.platform !== 'win32')(
  'adaptador PC/SC con proceso real y datos sintéticos',
  () => {
    let directory: string;
    let script: string;
    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'coonecta-reader-'));
      script = join(directory, 'status.ps1');
    });
    afterEach(async () => {
      await removeTestDirectory(directory, 'coonecta-reader-');
    });
    it('proyecta presencia/ATR y comparte una consulta concurrente', async () => {
      await writeFile(
        script,
        `Write-Output '{"ok":true,"readers":[{"name":"CI Reader","state":"CARD_PRESENT","atr":"3B00","secret":"PRIVATE"}]}'`,
      );
      const adapter = new WindowsPcscReader(script);
      const first = adapter.inspect(),
        second = adapter.inspect();
      expect(first).toBe(second);
      const snapshot = await first;
      expect(snapshot.readers).toEqual([{ name: 'CI Reader', state: 'CARD_PRESENT', atr: '3B00' }]);
      expect(snapshot.identityStatus).toBe('NOT_READ');
      expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');
    });
    it('recupera el servicio tras un timeout de dependencia', async () => {
      await writeFile(script, 'Start-Sleep -Seconds 30');
      const blocked = new WindowsPcscReader(script, 100);
      expect(await inspectReader(blocked, undefined)).toMatchObject({
        ok: false,
        error: { code: 'TIMEOUT' },
      });
      await writeFile(script, `Write-Output '{"ok":true,"readers":[]}'`);
      expect((await new WindowsPcscReader(script).inspect()).readers).toEqual([]);
    });
    it('no propaga stdout inválido ni dependencia ausente', async () => {
      await writeFile(script, "Write-Output 'PRIVATE DRIVER FAILURE'");
      expect(await inspectReader(new WindowsPcscReader(script), undefined)).toMatchObject({
        ok: false,
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
      expect(
        await inspectReader(new WindowsPcscReader(join(directory, 'absent.ps1')), undefined),
      ).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    });
    it('cancela el proceso pendiente al cerrar el adaptador', async () => {
      await writeFile(script, 'Start-Sleep -Seconds 30');
      const adapter = new WindowsPcscReader(script);
      const result = inspectReader(adapter, undefined);
      adapter.close();
      expect(await result).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
      await expect(adapter.inspect()).rejects.toThrow('PCSC_UNAVAILABLE');
    });
  },
);
