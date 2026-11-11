import type {
  CompanyPricingCategoryView,
  GeneralDiscountView,
  PricingItemView,
} from '@lfd/contracts';

import { discountArticlesOf } from '../general-discount-pricing';

/**
 * Le catalogue des specs de la remise générale : Pains (racine) > Pains
 * spéciaux, Chocolat à part, et la remise « −30 % sur tout, −40 % sur le
 * pain, sauf le chocolat ».
 */

export function item(
  sku: string,
  canonicalMillicents = 200_000,
  floor: number | null = null,
): PricingItemView {
  return {
    sku,
    name: `Nom ${sku}`,
    canonicalMillicents,
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
    finalMillicents: canonicalMillicents,
    elasticity: null,
    negotiationRoom:
      floor === null
        ? null
        : {
            floorMillicents: floor,
            maxDiscountMillicents: canonicalMillicents - floor,
            maxDiscountBp: 0,
          },
  };
}

// Pains (racine) > Pains spéciaux ; Chocolat à part.
export const CATEGORIES: CompanyPricingCategoryView[] = [
  {
    id: 'pain',
    name: 'Pains',
    family: { id: 'pain', name: 'Pains', position: 1, path: ['pain'] },
    items: [item('BAG'), item('PAV')],
  },
  {
    id: 'pain_spe',
    name: 'Pains spéciaux',
    family: {
      id: 'pain_spe',
      name: 'Pains spéciaux',
      position: 2,
      path: ['pain_spe', 'pain'],
      ancestors: [{ id: 'pain', name: 'Pains', position: 1 }],
    },
    items: [item('SEI')],
  },
  {
    id: 'choco',
    name: 'Chocolat',
    family: { id: 'choco', name: 'Chocolat', position: 3 },
    items: [item('TAB', 100_000, 90_000)],
  },
];

export const ARTICLES = discountArticlesOf(CATEGORIES);

export const HUGO: GeneralDiscountView = {
  mode: 'all_except',
  baseBp: 3000,
  rules: [
    { target: 'category', targetId: 'pain', bp: 4000 },
    { target: 'category', targetId: 'pain_spe', bp: 2500 },
    { target: 'category', targetId: 'choco', bp: null },
    { target: 'variant', targetId: 'BAG', bp: 3500 },
  ],
};
