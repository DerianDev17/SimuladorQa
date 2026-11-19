import { describe, expect, it } from 'vitest';
import {
  readObservationInterval,
  saveObservationInterval,
} from '../../apps/desktop/src/renderer/observation-interval';

const interval = { from: '2026-11-19 00:00:00.000', to: '2026-11-19 23:59:59.997' };
describe('intervalo recordado de Mediator', () => {
  it('recuerda únicamente el intervalo SQL sin convertir su zona y permite reabrir', () => {
    const values = new Map<string, string>();
    const storage = () => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    });
    expect(readObservationInterval(storage)).toEqual({ from: '', to: '' });
    expect(saveObservationInterval(storage, interval)).toBe(true);
    expect(readObservationInterval(storage)).toEqual(interval);
    expect([...values.values()]).toEqual([JSON.stringify(interval)]);
    expect(saveObservationInterval(storage, { ...interval, to: '2026-11-21 00:00:00.000' })).toBe(
      false,
    );
    expect(readObservationInterval(storage)).toEqual(interval);
  });
  it('ignora datos corruptos, versiones desconocidas y almacenamiento no disponible', () => {
    for (const raw of [
      'broken',
      JSON.stringify({ ...interval, version: 2 }),
      '{}',
      'x'.repeat(151),
    ]) {
      expect(readObservationInterval(() => ({ getItem: () => raw, setItem: () => {} }))).toEqual({
        from: '',
        to: '',
      });
    }
    const unavailable = () => {
      throw Error('private');
    };
    expect(readObservationInterval(unavailable)).toEqual({ from: '', to: '' });
    expect(saveObservationInterval(unavailable, interval)).toBe(false);
  });
});
