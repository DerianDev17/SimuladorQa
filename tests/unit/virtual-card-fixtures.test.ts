import { describe, expect, it } from 'vitest';
import {
  createVirtualCardFixtures,
  parseVirtualCardGenerationRequest,
} from '../../packages/domain/src/virtual-card-fixtures';

describe('generador de referencias virtuales locales', () => {
  it('valida cantidades enteras de 1 a 20 y rechaza campos adicionales', () => {
    expect(parseVirtualCardGenerationRequest({ count: 1 })).toEqual({ count: 1 });
    expect(parseVirtualCardGenerationRequest({ count: 20 })).toEqual({ count: 20 });
    expect(parseVirtualCardGenerationRequest({ count: 0 })).toBeUndefined();
    expect(parseVirtualCardGenerationRequest({ count: 21 })).toBeUndefined();
    expect(parseVirtualCardGenerationRequest({ count: 1.5 })).toBeUndefined();
    expect(
      parseVirtualCardGenerationRequest({ count: 2, pan: 'fixture-no-numerico' }),
    ).toBeUndefined();
  });

  it('genera referencias opacas sin datos de pago', () => {
    let sequence = 0;
    const cards = createVirtualCardFixtures(
      2,
      () => `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee${++sequence}`,
      () => '2026-10-20T12:00:00.000Z',
    );

    expect(cards).toEqual([
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1',
        scheme: 'VISA',
        reference: 'QA-VISA-EEEEEEE1',
        createdAt: '2026-10-20T12:00:00.000Z',
        scope: 'LOCAL_SIMULATION_ONLY',
      },
      {
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee2',
        scheme: 'VISA',
        reference: 'QA-VISA-EEEEEEE2',
        createdAt: '2026-10-20T12:00:00.000Z',
        scope: 'LOCAL_SIMULATION_ONLY',
      },
    ]);
    expect(JSON.stringify(cards)).not.toMatch(/pan|cvv|pin|arqc/i);
  });
});
