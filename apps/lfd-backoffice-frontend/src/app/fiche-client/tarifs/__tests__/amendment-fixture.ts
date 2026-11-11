import { editOf, type AmendmentEdit, type AmendmentState } from '../amendment-diff';
import type { AmendmentDating } from '../amendment-body';
import type { DiscountArticle } from '../general-discount-pricing';
import { NO_PROMOTION_POLICY } from '../promotion-policy';

/**
 * L'avenant des specs de l'écart : trois prix fermes (dont une ligne à
 * paliers), « −30 % sauf le chocolat », et cinq articles.
 */

export const TODAY = '2026-11-11';
export const DATING: AmendmentDating = {
  fromDay: '',
  toDay: '',
  reason: 'Renégociation',
  today: TODAY,
  basedOnAmendmentId: 'am_1',
};

export const STATE: AmendmentState = {
  firm: [
    { sku: 'CRO', tiers: [{ minQuantity: 1, unitPriceMillicents: 130_000 }] },
    { sku: 'BAG', tiers: [{ minQuantity: 1, unitPriceMillicents: 100_000 }] },
    {
      sku: 'PAL',
      tiers: [
        { minQuantity: 1, unitPriceMillicents: 300_000 },
        { minQuantity: 10, unitPriceMillicents: 250_000 },
      ],
    },
  ],
  generalDiscount: {
    mode: 'all_except',
    baseBp: 3000,
    rules: [{ target: 'category', targetId: 'choc', bp: null }],
  },
  promotionPolicy: NO_PROMOTION_POLICY,
};

export const ARTICLES: readonly DiscountArticle[] = [
  {
    sku: 'CRO',
    name: 'Croissant',
    categoryPath: ['vien'],
    canonicalMillicents: 150_000,
    floorMillicents: 120_000,
  },
  {
    sku: 'BAG',
    name: 'Baguette',
    categoryPath: ['pain'],
    canonicalMillicents: 120_000,
    floorMillicents: null,
  },
  {
    sku: 'PAL',
    name: 'Pain long',
    categoryPath: ['pain'],
    canonicalMillicents: 350_000,
    floorMillicents: null,
  },
  {
    sku: 'CHO',
    name: 'Chocolat',
    categoryPath: ['choc'],
    canonicalMillicents: 200_000,
    floorMillicents: null,
  },
  {
    sku: 'BRI',
    name: 'Brioche',
    categoryPath: ['vien'],
    canonicalMillicents: 200_000,
    floorMillicents: null,
  },
];

export function edited(change: (edit: AmendmentEdit) => AmendmentEdit): AmendmentEdit {
  return change(editOf(STATE));
}

export function article(sku: string): DiscountArticle {
  const found = ARTICLES.find((entry) => entry.sku === sku);
  if (found === undefined) {
    throw new Error(sku);
  }
  return found;
}
