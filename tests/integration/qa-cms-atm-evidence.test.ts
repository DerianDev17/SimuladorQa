import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  FileQaCmsAtmEvidence,
  documentedCmsAtmContextBinding,
} from '../../apps/desktop/src/main/infrastructure/qa-cms-atm-evidence';
import { QaBalanceContextRouter } from '../../apps/desktop/src/main/qa-balance-context-router';
import { BalanceInquiryService } from '../../apps/desktop/src/main/balance-inquiry-service';
import { cmsEvidenceFixture } from '../helpers/qa-cms-atm-evidence';
import { removeTestDirectory } from '../helpers/temporary-directory';
import { SharedQaPinKey } from '../../apps/desktop/src/main/shared-qa-pin-key';
import { FileQaExecutionProfiles } from '../../apps/desktop/src/main/infrastructure/qa-execution-profiles';
import { qaExecutionFixture } from '../helpers/qa-execution';

it('recupera la referencia compartida desde disco y detecta la rotación del origen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coonecta-cms-evidence-'));
  try {
    const source = qaExecutionFixture();
    const { input, row, target } = cmsEvidenceFixture();
    row.terminalId = target.terminalId = 'ATM20524';
    row.directPinKey = {
      keyReference: source.profile.keyReference,
      sourceProfileId: source.profile.id,
      approvalSource: 'USER_QA_INSTRUCTION',
      approvedAt: row.verifiedAt,
    };
    const file = join(directory, 'cms.json');
    const profileFile = join(directory, 'profiles.json');
    await writeFile(file, JSON.stringify(input));
    await writeFile(profileFile, JSON.stringify(source.input));
    const evidence = (await new FileQaCmsAtmEvidence(file).read())[0]!;
    const shared = new SharedQaPinKey(new FileQaExecutionProfiles(profileFile), {
      available: async (reference) => reference === source.profile.keyReference,
    });
    const provider = documentedCmsAtmContextBinding(evidence, shared).provider;
    expect((await provider.inspect(target)).blockers.map((b) => b.id)).toEqual([
      'QA-EXECUTION-PROFILE-BINDING',
    ]);
    source.row.keyReference = randomUUID();
    await writeFile(profileFile, JSON.stringify(source.input));
    expect((await provider.inspect(target)).blockers.map((b) => b.id)).toEqual([
      'QA-DIRECT-PIN-KEY-BINDING',
      'QA-EXECUTION-PROFILE-BINDING',
    ]);
  } finally {
    await removeTestDirectory(directory, 'coonecta-cms-evidence-');
  }
});

it('persiste evidencia CMS y diagnostica ISO directo sin exigir TCS ni aceptar secretos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'coonecta-cms-evidence-'));
  const file = join(directory, 'evidence.json');
  try {
    const { input, target } = cmsEvidenceFixture();
    await expect(new FileQaCmsAtmEvidence(file).read()).rejects.toThrow();
    await writeFile(file, JSON.stringify(input));
    const [row] = await new FileQaCmsAtmEvidence(file).read();
    expect(row).toEqual(input.bindings[0]);
    const router = new QaBalanceContextRouter();
    router.bind(documentedCmsAtmContextBinding(row!));
    expect((await router.inspect(target)).ready).toBe(false);
    const service = new BalanceInquiryService(
      { read: async () => [], write: async () => {} },
      {
        exchange: async () => {
          throw Error('UNEXPECTED_TRANSPORT');
        },
      },
      {
        agentId: randomUUID(),
        hostname: 'synthetic',
        user: 'test',
        version: 'test',
        uuid: randomUUID,
        now: () => input.bindings[0]!.verifiedAt,
      },
      router,
    );
    expect((await service.inspect(target)).blockers.map((blocker) => blocker.id)).toEqual([
      'QA-DIRECT-PIN-KEY-BINDING',
      'QA-EXECUTION-PROFILE-BINDING',
    ]);
    await expect(router.acquire(target, new AbortController().signal)).rejects.toThrow(
      'QA_DIRECT_PIN_CONTEXT_NOT_BOUND',
    );
    for (const invalid of [
      '{ PRIVATE_INVALID_JSON',
      JSON.stringify({ ...input, key: 'PRIVATE_VALUE' }),
      Buffer.alloc(65537),
    ]) {
      await writeFile(file, invalid);
      await expect(new FileQaCmsAtmEvidence(file).read()).rejects.toThrow(
        'QA_CMS_ATM_EVIDENCE_INVALID',
      );
    }
  } finally {
    await removeTestDirectory(directory, 'coonecta-cms-evidence-');
  }
});
