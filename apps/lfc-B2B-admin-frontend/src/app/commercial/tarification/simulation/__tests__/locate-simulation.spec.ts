import { describe, expect, it } from 'vitest';
import type { PricingCategoryView, PricingItemView } from '@lfd/contracts';

import { gridRowOf, locateSimulation } from '../locate-simulation';

function item(sku: string): PricingItemView {
  return {
    sku,
    name: sku.toUpperCase(),
    canonicalCents: 100,
    ownFloor: null,
    volumeTiers: null,
    effectiveFloor: null,
    rules: [],
    supersededRuleIds: [],
    sealedByRuleId: null,
    sealedRuleIds: [],
    steps: [],
    floored: false,
    clampedToZero: false,
    finalCents: 100,
    negotiationRoom: null,
    elasticity: null,
  };
}

const categories: readonly PricingCategoryView[] = [
  {
    id: 'pains',
    name: 'Pains',
    vatRatePercent: 5.5,
    floor: null,
    items: [item('a'), item('b'), item('c')],
    rules: [],
    ladders: [],
    overlaps: [],
  },
  {
    id: 'viennoiseries',
    name: 'Viennoiseries',
    vatRatePercent: 5.5,
    floor: null,
    items: [item('d')],
    rules: [],
    ladders: [],
    overlaps: [],
  },
];

describe('locateSimulation', () => {
  it('retrouve l’article et son rayon', () => {
    expect(locateSimulation(categories, 'b')?.index).toBe(1);
    expect(locateSimulation(categories, 'd')?.categoryId).toBe('viennoiseries');
  });

  it('rend null sans sélection ou sur un article absent', () => {
    expect(locateSimulation(categories, null)).toBeNull();
    expect(locateSimulation(categories, 'inconnu')).toBeNull();
  });

  it('trouve le PREMIER article, dont le rang est zéro', () => {
    // Le piège : un rang 0 traité comme « absent » ferait sauter le décalage.
    expect(locateSimulation(categories, 'a')?.index).toBe(0);
  });
});

describe('gridRowOf', () => {
  const slot = locateSimulation(categories, 'a');

  it('décale ce qui SUIT le bloc, dans son rayon seulement', () => {
    expect(gridRowOf(slot, 'pains', 0)).toBe(1);
    expect(gridRowOf(slot, 'pains', 1)).toBe(3);
    expect(gridRowOf(slot, 'viennoiseries', 0)).toBe(1);
  });

  it('ne décale rien sans simulation ouverte', () => {
    expect(gridRowOf(null, 'pains', 2)).toBe(3);
  });

  it('pose le bloc juste sous sa ligne', () => {
    expect(slot?.gridRow).toBe(2);
  });
});
