import { describe, expect, it } from 'vitest';

import { binTypeShort, stackScales, tileScale } from './delivery-loading-tiles';

describe('les proportions des bacs', () => {
  it('rapporte chaque hauteur au type le plus haut', () => {
    expect(tileScale(32, 32)).toBe(1);
    expect(tileScale(22, 32)).toBe(0.6875);
    expect(tileScale(0, 32)).toBe(1);
    expect(tileScale(22, 0)).toBe(1);
  });

  it('prend le plus haut du PLAN, pas d’une rangée', () => {
    const scales = stackScales([
      { stackIndex: 1, binTypeHeightCm: 22 },
      { stackIndex: 2, binTypeHeightCm: 32 },
      { stackIndex: 3, binTypeHeightCm: 20 },
    ]);
    expect([...scales]).toEqual([
      [1, 0.6875],
      [2, 1],
      [3, 0.625],
    ]);
  });

  it('dit le type en court : le dernier mot', () => {
    expect(binTypeShort('Bac M')).toBe('M');
    expect(binTypeShort(' Bac  L ')).toBe('L');
    expect(binTypeShort('Isotherme')).toBe('Isotherme');
  });
});
