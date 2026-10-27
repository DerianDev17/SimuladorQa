import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileQaWithdrawalPolicies } from '../../apps/desktop/src/main/infrastructure/qa-withdrawal-policies';
import { qaExecutionFixture, qaWithdrawalPolicy } from '../helpers/qa-execution';
import { removeTestDirectory } from '../helpers/temporary-directory';

describe('archivo de contrato de retiro QA', () => {
  it('ausencia, contrato correcto, revocacion y contenido invalido', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'coonecta-withdrawal-policies-'));
    try {
      const path = join(directory, 'policy.json');
      const store = new FileQaWithdrawalPolicies(path);
      expect(await store.read()).toEqual([]);
      const policy = qaWithdrawalPolicy(qaExecutionFixture().profile);
      await writeFile(path, '\uFEFF' + JSON.stringify({ version: 1, policies: [policy] }));
      expect(await store.read()).toEqual([policy]);
      policy.allowedAmounts = 'ANY_POSITIVE_AMOUNT';
      await writeFile(path, JSON.stringify({ version: 1, policies: [policy] }));
      expect(await store.read()).toEqual([policy]);
      await writeFile(path, JSON.stringify({ version: 1, policies: [] }));
      expect(await store.read()).toEqual([]);
      for (const invalid of ['{"PRIVATE":', ' '.repeat(65537)]) {
        await writeFile(path, invalid);
        await expect(store.read()).rejects.toThrow('QA_WITHDRAWAL_POLICY_INVALID');
      }
    } finally {
      await removeTestDirectory(directory, 'coonecta-withdrawal-policies-');
    }
  });
});
