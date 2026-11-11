import type { CompanyPricingCategoryView, PriceStepView, PricingItemView } from '@lfd/contracts';
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

  it('porte le chemin du prix : les étapes que le serveur a résolues', () => {
    const step: PriceStepView = {
      stage: 'promotion',
      ruleId: 'promo_1',
      label: 'Remise La Folie Coffee',
      scope: null,
      resultMillicents: 160_000,
      supersedes: [],
    };
    const [shelf] = tarifShelves(
      shelfOf([item({ sku: 'CRO', finalMillicents: 160_000, steps: [step] })]),
      new Map(),
    );

    expect(shelf!.rows[0]!.chain).toMatchObject({
      canonicalMillicents: 200_000,
      finalMillicents: 160_000,
      steps: [step],
    });
  });

  it('dit quand une mercuriale en cours fixe déjà ce prix', () => {
    const [shelf] = tarifShelves(
      shelfOf([item({ sku: 'CRO' }), item({ sku: 'PAC', sealedByRuleId: 'merc_1' })]),
      new Map(),
    );

    expect(shelf!.rows.map((row) => row.negotiated)).toEqual([false, true]);
  });

  it('ne suit pas le prix tapé dans la mercuriale en cours de composition', () => {
    const [shelf] = tarifShelves(
      shelfOf([item({ sku: 'CRO', finalMillicents: 170_000 })]),
      withPrice(new Map(), 'CRO', '1,20'),
    );

    expect(shelf!.rows[0]!.currentMillicents).toBe(170_000);
  });
});
