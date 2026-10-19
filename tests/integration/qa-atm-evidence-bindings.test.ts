import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FileQaAtmEvidenceBindings } from '../../apps/desktop/src/main/infrastructure/qa-atm-evidence-bindings';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { evidenceFixture } from '../helpers/qa-atm-evidence';

describe('persistencia de evidencia ATM', () => {
  it('recupera después de reinicio y rechaza ausencias, JSON inválido y archivo excesivo', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'coonecta-atm-evidence-'));
    const path = join(directory, 'bindings.json');
    try {
      await expect(new FileQaAtmEvidenceBindings(path).read()).rejects.toThrow();
      const { input } = evidenceFixture();
      await writeFile(path, JSON.stringify(input));
      expect(await new FileQaAtmEvidenceBindings(path).read()).toEqual(input.bindings);
      await writeFile(path, '{');
      await expect(new FileQaAtmEvidenceBindings(path).read()).rejects.toThrow();
      await writeFile(path, Buffer.alloc(65537));
      await expect(new FileQaAtmEvidenceBindings(path).read()).rejects.toThrow(
        'QA_ATM_EVIDENCE_INVALID',
      );
    } finally {
      await removeTestDirectory(directory, 'coonecta-atm-evidence-');
    }
  });
});
