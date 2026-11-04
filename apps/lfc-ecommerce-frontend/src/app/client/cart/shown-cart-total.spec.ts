import type { ShopQuoteView } from '@lfd/contracts';

import { shownCartTotalCents } from './shown-cart-total';

const QUOTE: ShopQuoteView = {
  lines: [],
  subtotalHtCents: 2_000,
  discountCents: 0,
  discountAdjustment: null,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  deliveryVatMode: 'standard',
  vat: [
    { rate: 5.5, amountCents: 55 },
    { rate: 10, amountCents: 100 },
  ],
  totalCents: 2_155,
};

describe('shownCartTotalCents', () => {
  it('TTC hors compte, HT au compte', () => {
    expect(shownCartTotalCents(QUOTE, false)).toBe(2_155);
    expect(shownCartTotalCents(QUOTE, true)).toBe(2_000);
  });

  /**
   * Régression : le HT du panier était « total moins TVA », une seconde
   * formule à côté de celle du bon PDF (`orderPretaxCents`). Devis
   * volontairement incohérent pour que les deux divergent (2026-11-04).
   */
  it('au compte, le HT se lit sur les montants HT du devis, pas total moins TVA', () => {
    const quote: ShopQuoteView = {
      ...QUOTE,
      discountCents: 200,
      voucherDiscountCents: 100,
      deliveryFeeCents: 500,
      lateFeeCents: 300,
      vat: [],
      totalCents: 9_999,
    };

    expect(shownCartTotalCents(quote, true)).toBe(2_500);
  });
});
