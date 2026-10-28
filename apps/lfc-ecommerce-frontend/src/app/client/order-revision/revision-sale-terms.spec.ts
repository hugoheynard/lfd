import type { ShopItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { TEST_ITEMS } from '../shop/shop-catalogue.fixture';
import { addedArticleOf, weightFieldOf } from './revision-sale-terms';

/** P5 de `vente-au-poids.md` : la page de modification saisit un poids au pas de l'article. */
describe('revision-sale-terms', () => {
  const [base] = TEST_ITEMS;
  if (base === undefined) {
    throw new Error('TEST_ITEMS est vide');
  }
  const gravlax: ShopItemView = {
    ...base,
    sku: 'G',
    name: 'Gravlax',
    saleUnit: 'weight',
    weightStepGrams: 100,
    weightMinGrams: 250,
  };

  it('une pièce : un pas d’un, un plancher d’un, rien à dire à côté', () => {
    expect(weightFieldOf({ sku: 'C', name: 'C', quantity: 3 }, undefined)).toEqual({
      step: 1,
      minimum: 1,
      weight: null,
    });
  });

  it('au poids : le pas et le minimum de l’article, et le poids dit', () => {
    const line = { sku: 'G', name: 'Gravlax', quantity: 1_250, saleUnit: 'weight' as const };
    expect(weightFieldOf(line, gravlax)).toEqual({
      step: 100,
      minimum: 300,
      weight: '1,25 kg',
    });
  });

  it('au poids, un article que la boutique ne sert plus avance au gramme', () => {
    const line = { sku: 'G', name: 'Gravlax', quantity: 500, saleUnit: 'weight' as const };
    expect(weightFieldOf(line, undefined)).toEqual({ step: 1, minimum: 1, weight: '500 g' });
  });

  it('un article ajouté dit son unité, son pas et sa première quantité', () => {
    expect(addedArticleOf(gravlax)).toEqual({
      sku: 'G',
      name: 'Gravlax',
      saleUnit: 'weight',
      step: 100,
      first: 300,
    });
  });
});
