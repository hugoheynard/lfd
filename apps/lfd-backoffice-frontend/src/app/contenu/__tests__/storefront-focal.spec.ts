import { describe, expect, it } from 'vitest';

import { focalPositionOf } from '../storefront-focal';

describe('focalPositionOf — l’aperçu recadre comme la boutique', () => {
  it('pose le point en pourcentages, au dixième', () => {
    expect(focalPositionOf({ x: 0.2, y: 0.75 })).toBe('20% 75%');
    expect(focalPositionOf({ x: 0.1234, y: 1 })).toBe('12.3% 100%');
  });

  it('recadre au centre quand personne ne s’est prononcé', () => {
    expect(focalPositionOf(null)).toBe('50% 50%');
    expect(focalPositionOf(undefined)).toBe('50% 50%');
  });
});
