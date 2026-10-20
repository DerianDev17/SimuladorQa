import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { LoadTestService } from '../../apps/desktop/src/main/load-test-service';
import type { Preferences, RuntimeIdentity } from '../../apps/desktop/src/main/ports';
import { LOAD_TEST_LOCAL_MAX_TPS } from '../../packages/domain/src/load-test';

const runtime: RuntimeIdentity = {
  agentId: randomUUID(),
  hostname: 'qa-load-test',
  user: 'tester',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-20T12:00:00.000Z',
};

function preferences(environment: Preferences['environment'] = 'QA') {
  return {
    read: vi.fn(async () => ({ version: 1 as const, environment, audit: [] })),
  };
}

const validDraft = () => ({
  environment: 'QA',
  mode: 'LOAD',
  operation: 'BALANCE',
  atmId: randomUUID(),
  atmRevision: 1,
  maxTransactions: 10,
  targetTps: LOAD_TEST_LOCAL_MAX_TPS,
  concurrency: 1,
  rampUpSeconds: 0,
  durationSeconds: 10,
});

describe('preparación de corridas QA de saldo', () => {
  it('devuelve un plan bloqueado y confirma que no hubo trama ni envío', async () => {
    const service = new LoadTestService(runtime, preferences());
    const result = await service.prepare(validDraft());

    expect(result).toMatchObject({
      ok: true,
      value: {
        draft: { operation: 'BALANCE', targetTps: 5 },
        status: 'BLOCKED_EXECUTION',
        frameGenerated: false,
        transmissionAttempted: false,
        blockers: [
          { id: 'LOAD_LIMITS_NOT_APPROVED' },
          { id: 'QA_CARD_SOURCE_NOT_READY' },
          { id: 'LOAD_EXECUTOR_NOT_IMPLEMENTED' },
        ],
      },
    });
  });

  it('rechaza otro ambiente y propuestas mayores al techo en Main', async () => {
    const nonQa = new LoadTestService(runtime, preferences('PREPROD'));
    expect(await nonQa.prepare(validDraft())).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    const qa = new LoadTestService(runtime, preferences());
    expect(await qa.prepare({ ...validDraft(), targetTps: 6 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
