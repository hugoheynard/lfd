import type { CompanyPricingCategoryView, PricingItemView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { withPrice } from '../draft-prices';
import { tarifShelves } from '../tarif-shelves';

/**
 * **Le prix de ce client** : ce que le serveur a résolu pour lui, réductions
 * comprises — jamais le tarif catalogue, ni le prix qu'on est en train de taper.
 */

function item(overrides: Partial<PricingItemView> & { sku: string }): PricingItemView {
  return {
    name: overrides.sku,
    canonicalMillicents: 200_000,
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
    finalMillicents: 200_000,
    elasticity: null,
    negotiationRoom: null,
    ...overrides,
  };
}

function shelfOf(items: readonly PricingItemView[]): CompanyPricingCategoryView[] {
  return [
    {
      id: 'fam_01J9V1',
      name: 'Viennoiseries',
      family: { id: 'fam_01J9V1', name: 'Viennoiseries', position: 1 },
      items,
    },
  ];
}

describe('le prix de ce client', () => {
  it('lit le prix que le serveur a résolu pour lui, à côté du tarif catalogue', () => {
    const [shelf] = tarifShelves(
      shelfOf([item({ sku: 'CRO', finalMillicents: 170_000 })]),
      new Map(),
    );

    expect(shelf!.rows[0]).toMatchObject({
      catalogMillicents: 200_000,
      currentMillicents: 170_000,
    });
  });

  it('ne suit pas le prix tapé dans la mercuriale en cours de composition', () => {
    const [shelf] = tarifShelves(
      shelfOf([item({ sku: 'CRO', finalMillicents: 170_000 })]),
      withPrice(new Map(), 'CRO', '1,20'),
    );

    expect(shelf!.rows[0]!.currentMillicents).toBe(170_000);
  });
});
