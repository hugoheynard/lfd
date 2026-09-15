import { describe, expect, it } from 'vitest';

import { discountAudienceSuffix } from '../pickup-discount-audience';

/**
 * La carte d'un point dit à qui va sa remise. Les deux clientèles ne se disent
 * pas : c'est l'existant, et l'écrire partout ferait lire une restriction.
 */
describe('la clientèle d’une remise de retrait, sur la carte du point', () => {
  it('dit « · B2B » pour une remise réservée aux pros', () => {
    expect(discountAudienceSuffix({ b2b: true, b2c: false })).toBe(' · B2B');
  });

  it('dit « · B2C » pour une remise réservée aux particuliers', () => {
    expect(discountAudienceSuffix({ b2b: false, b2c: true })).toBe(' · B2C');
  });

  it('ne dit rien quand la remise vise les deux', () => {
    expect(discountAudienceSuffix({ b2b: true, b2c: true })).toBe('');
  });
});
