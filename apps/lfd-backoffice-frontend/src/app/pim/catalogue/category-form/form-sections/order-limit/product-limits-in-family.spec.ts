import type { OrderTimeLimitListItem } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { hasParentFamilyLimit, productLimitsInFamily } from './product-limits-in-family';

function rule(
  type: 'product' | 'category',
  id: string,
  daysBefore: number,
  time: string,
  over: Partial<OrderTimeLimitListItem> = {},
): OrderTimeLimitListItem {
  return {
    id: `r-${id}`,
    scope: { type, id },
    scopeLabel: null,
    daysBefore,
    time,
    graceMinutes: null,
    staffMayExceed: false,
    archived: false,
    excludedProductIds: [],
    exclusions: [],
    ...over,
  };
}

const FAMILIES = [
  { id: 'patisserie', parentId: null },
  { id: 'gateaux', parentId: 'patisserie' },
  { id: 'entremets', parentId: 'gateaux' },
  { id: 'pain', parentId: null },
];
const PRODUCTS = [
  { id: 'p1', categoryId: 'gateaux' },
  { id: 'p2', categoryId: 'entremets' },
  { id: 'p3', categoryId: 'pain' },
];
const FAMILY = rule('category', 'gateaux', 2, '12:00');

const standings = (rules: readonly OrderTimeLimitListItem[]): Record<string, string> =>
  Object.fromEntries(
    productLimitsInFamily(rules, PRODUCTS, FAMILIES, 'gateaux').map((item) => [
      item.product.id,
      item.standing,
    ]),
  );

describe('productLimitsInFamily', () => {
  it('plus de jours avant : la limite du produit s’applique', () => {
    expect(standings([FAMILY, rule('product', 'p1', 3, '18:00')])).toEqual({ p1: 'stricter' });
  });

  it('à jours égaux, l’heure plus tôt l’emporte', () => {
    expect(standings([FAMILY, rule('product', 'p1', 2, '10:00')])).toEqual({ p1: 'stricter' });
    expect(standings([FAMILY, rule('product', 'p1', 2, '14:00')])).toEqual({ p1: 'overridden' });
  });

  it('moins de jours avant : sans effet, la famille est plus stricte (sous-famille comprise)', () => {
    expect(standings([FAMILY, rule('product', 'p2', 1, '08:00')])).toEqual({ p2: 'overridden' });
  });

  it('égale', () => {
    expect(standings([FAMILY, rule('product', 'p1', 2, '12:00')])).toEqual({ p1: 'equal' });
  });

  it('exclu de la famille : sa propre limite s’applique', () => {
    const family = rule('category', 'gateaux', 2, '12:00', { excludedProductIds: ['p1'] });
    expect(standings([family, rule('product', 'p1', 1, '18:00')])).toEqual({ p1: 'excluded' });
  });

  it('sans limite de famille, ou archivée : listé sans comparaison', () => {
    const own = rule('product', 'p1', 1, '18:00');
    expect(standings([own])).toEqual({ p1: 'none' });
    expect(standings([{ ...FAMILY, archived: true }, own])).toEqual({ p1: 'none' });
  });

  it('ignore une limite de produit archivée', () => {
    expect(standings([FAMILY, rule('product', 'p1', 3, '18:00', { archived: true })])).toEqual({});
  });

  it('ignore un produit hors de la descendance', () => {
    expect(standings([FAMILY, rule('product', 'p3', 3, '18:00')])).toEqual({});
  });
});

describe('hasParentFamilyLimit', () => {
  it('voit une limite en vigueur au-dessus, pas celle de la famille ni une archivée', () => {
    expect(hasParentFamilyLimit([FAMILY], FAMILIES, 'gateaux')).toBe(false);
    expect(
      hasParentFamilyLimit([rule('category', 'patisserie', 1, '18:00')], FAMILIES, 'gateaux'),
    ).toBe(true);
    expect(
      hasParentFamilyLimit(
        [rule('category', 'patisserie', 1, '18:00', { archived: true })],
        FAMILIES,
        'gateaux',
      ),
    ).toBe(false);
  });
});
