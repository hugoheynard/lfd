import { describe, expect, it } from 'vitest';

import { b2bChannelState } from '../products-page/products-page';

/**
 * Le badge de la colonne « Boutique B2B » ne dit plus que l'appartenance
 * depuis X2 (2026-10-17) : le push et son aperçu, qui portaient « poussée » et
 * « non vendue aux pros », sont partis.
 */
describe('le badge de la colonne « Boutique B2B »', () => {
  it('reste hors canal tant qu’aucune appartenance n’existe', () => {
    expect(b2bChannelState(false)).toBe('hors_canal');
  });

  it('dit « sur le canal » dès que l’appartenance existe', () => {
    expect(b2bChannelState(true)).toBe('sur_le_canal');
  });
});
