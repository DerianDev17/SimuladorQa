import { describe, expect, it } from 'vitest';
import { loadPacingDelay } from '../../apps/desktop/src/main/infrastructure/load-pacing';

describe('ritmo de carga', () => {
  it('inicia la primera operación sin espera y respeta el intervalo restante', () => {
    expect(loadPacingDelay(0, 1000, 1000, 5)).toBe(0);
    expect(loadPacingDelay(1, 1000, 1100, 5)).toBe(100);
  });

  it('no agrega una segunda pausa cuando la operación ya consumió el intervalo', () => {
    expect(loadPacingDelay(1, 1000, 1350, 5)).toBe(0);
  });
});
