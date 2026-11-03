import { describe, it, expect } from 'vitest';
import {
  parseSaveLoadConfiguration,
  parseDeleteLoadConfiguration,
  validSavedLoadConfiguration,
  stressPreset,
} from '../../packages/domain/src/load-configurations';
import { parseLoadRunDraft } from '../../packages/domain/src/load-run';
import { loadTargetTps } from '../../packages/domain/src/load-test';
import { historyRun } from '../helpers/load-history';

describe('configuraciones y presets de estrés', () => {
  it('valida y separa un plan reutilizable de referencias efímeras', () => {
    const draft = stressPreset(historyRun().draft, 3);
    const request = { id: null, revision: null, name: '  Estrés gradual  ', draft };
    const parsed = parseSaveLoadConfiguration(request)!;
    expect(parsed.name).toBe('Estrés gradual');
    request.draft.targetTps = 5;
    expect(parsed.draft.targetTps).toBe(3);
    expect(
      parseSaveLoadConfiguration({ ...request, cardReadId: historyRun().runId }),
    ).toBeUndefined();
    expect(parseSaveLoadConfiguration({ ...request, name: 'PIN=1234' })).toBeUndefined();
  });
  it.each([3, 5] as const)(
    'prepara una rampa a %i TPS dentro de los límites existentes',
    (target) => {
      const draft = stressPreset(historyRun().draft, target);
      expect(parseLoadRunDraft(draft)).toEqual(draft);
      expect(draft).toMatchObject({
        mode: 'STRESS',
        targetTps: target,
        rampUpSeconds: 20,
        durationSeconds: 60,
        maxTransactions: 100,
      });
      expect(loadTargetTps(draft, 0)).toBe(1);
      expect(loadTargetTps(draft, 20000)).toBe(target);
      expect(loadTargetTps(draft, 60000)).toBe(target);
      expect(loadTargetTps(draft, 15000)).toBeLessThanOrEqual(target);
      const withdrawal = stressPreset(
        { ...draft, operation: 'WITHDRAWAL', amount: '25.50' },
        target,
      );
      expect(withdrawal.concurrency).toBe(1);
      expect(parseLoadRunDraft(withdrawal)).toBeDefined();
    },
  );
  it('rechaza límites y rampa inválidos sin inventar un perfil alternativo', () => {
    const draft = stressPreset(historyRun().draft, 3);
    for (const invalid of [
      { targetTps: 6 },
      { targetTps: 0.01 },
      { maxTransactions: 101 },
      { durationSeconds: 301 },
      { concurrency: 6 },
      { rampUpSeconds: 0 },
      { rampUpSeconds: 60 },
    ])
      expect(
        parseSaveLoadConfiguration({
          id: null,
          revision: null,
          name: 'Prueba',
          draft: { ...draft, ...invalid },
        }),
      ).toBeUndefined();
    expect(
      parseSaveLoadConfiguration({ id: null, revision: 1, name: 'Prueba', draft }),
    ).toBeUndefined();
    expect(parseDeleteLoadConfiguration({ id: 'bad', revision: 1 })).toBeUndefined();
    expect(
      validSavedLoadConfiguration({
        id: historyRun().runId,
        revision: 1,
        name: 'Prueba',
        draft,
        createdAt: 'bad',
        updatedAt: 'bad',
      }),
    ).toBe(false);
  });
});
