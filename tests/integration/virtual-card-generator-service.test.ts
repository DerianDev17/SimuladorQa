import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { VirtualCardGeneratorService } from '../../apps/desktop/src/main/virtual-card-generator-service';
import type { Preferences, RuntimeIdentity } from '../../apps/desktop/src/main/ports';

const runtime: RuntimeIdentity = {
  agentId: randomUUID(),
  hostname: 'qa-virtual-card-test',
  user: 'tester',
  version: 'test',
  uuid: randomUUID,
  now: () => '2026-10-20T12:00:00.000Z',
};

function preferences(
  read: () => Promise<{
    version: 1;
    environment: Preferences['environment'];
    audit: [];
  }> = async () => ({ version: 1, environment: 'QA', audit: [] }),
) {
  return { read: vi.fn(read) };
}

describe('servicio de referencias de tarjetas QA', () => {
  it('genera referencias ficticias en QA sin incluir credenciales', async () => {
    const service = new VirtualCardGeneratorService(runtime, preferences());
    const result = await service.generate({ count: 3 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value.every((item) => item.scheme === 'VISA')).toBe(true);
    expect(result.value.every((item) => item.scope === 'LOCAL_SIMULATION_ONLY')).toBe(true);
    expect(new Set(result.value.map((item) => item.id)).size).toBe(3);
    expect(JSON.stringify(result.value)).not.toMatch(/pan|cvv|pin|arqc/i);
  });

  it('rechaza cantidades inválidas, PREPROD y un almacén de preferencias no disponible', async () => {
    expect(
      await new VirtualCardGeneratorService(runtime, preferences()).generate({ count: 0 }),
    ).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(
      await new VirtualCardGeneratorService(
        runtime,
        preferences(async () => ({ version: 1, environment: 'PREPROD', audit: [] })),
      ).generate({ count: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    expect(
      await new VirtualCardGeneratorService(
        runtime,
        preferences(async () => {
          throw new Error('offline');
        }),
      ).generate({ count: 1 }),
    ).toMatchObject({ ok: false, error: { code: 'STORAGE_UNAVAILABLE' } });
  });
});
