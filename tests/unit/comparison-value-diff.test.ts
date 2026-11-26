import { describe, expect, it } from 'vitest';
import { compareDisplayValues } from '../../apps/desktop/src/renderer/comparison-value-diff';

describe('resaltado literal de caracteres', () => {
  it.each([
    ['', ''],
    ['ABC', 'ABC'],
    ['A😀B', 'A😀C'],
    ['ABC', 'ABXC'],
    ['ABXC', 'ABC'],
    ['00', '96'],
    ['x A y B z', 'x C y D z'],
    [' A ', ' A'],
    ['', 'NEW'],
  ])('conserva exactamente A=%s y B=%s', (a, b) => {
    const diff = compareDisplayValues(a, b);
    expect(diff.reference.map((part) => part.text).join('')).toBe(a);
    expect(diff.current.map((part) => part.text).join('')).toBe(b);
    expect(
      diff.reference
        .filter((part) => !part.changed)
        .map((part) => part.text)
        .join(''),
    ).toBe(
      diff.current
        .filter((part) => !part.changed)
        .map((part) => part.text)
        .join(''),
    );
  });
  it('alinea inserciones y separa cambios distantes', () => {
    expect(compareDisplayValues('ABCD', 'ABXCD').current).toEqual([
      { text: 'AB', changed: false },
      { text: 'X', changed: true },
      { text: 'CD', changed: false },
    ]);
    expect(
      compareDisplayValues('a1b2c', 'a3b4c')
        .reference.filter((part) => part.changed)
        .map((part) => part.text),
    ).toEqual(['1', '2']);
  });
  it('acota el coste para campos largos sin perder evidencia', () => {
    const a = 'PREFIX' + 'A'.repeat(20000) + 'END';
    const b = 'PREFIX' + 'B'.repeat(21000) + 'END';
    const diff = compareDisplayValues(a, b);
    expect(diff.reference).toHaveLength(3);
    expect(diff.reference.map((part) => part.text).join('')).toBe(a);
    expect(diff.current.map((part) => part.text).join('')).toBe(b);
  });
});
