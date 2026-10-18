import { describe, expect, it } from 'vitest';

import { placementOptions } from '../suggestion-format';

describe('ce que l’écran dit d’une suggestion', () => {
  it('ferme les emplacements que le « Quand » rend impossibles, en disant pourquoi', () => {
    const options = placementOptions('product_in_cart');
    expect(options.map((one) => one.value)).toEqual(['home', 'cart', 'product']);
    expect(options.find((one) => one.value === 'cart')?.disabled).toBeUndefined();
    const home = options.find((one) => one.value === 'home');
    expect(home?.disabled).toBe(true);
    expect(home?.label).toBe(
      'Sur l’accueil — impossible ici : l’accueil ne montre ni panier ni fiche',
    );
    expect(placementOptions('everywhere').every((one) => one.disabled !== true)).toBe(true);
  });
});
