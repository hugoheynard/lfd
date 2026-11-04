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
  pretaxCents: 2_000,
  totalCents: 2_155,
};

describe('shownCartTotalCents', () => {
  it('TTC hors compte, HT au compte', () => {
    expect(shownCartTotalCents(QUOTE, false)).toBe(2_155);
    expect(shownCartTotalCents(QUOTE, true)).toBe(2_000);
  });

  /**
   * Régression : le HT du panier était « total moins TVA », puis la règle du
   * bon refaite à l'écran. Il lit le HT que le serveur a calculé (plan L6) —
   * devis volontairement incohérent avec lui (2026-11-04).
   */
  it('au compte, affiche le HT du devis tel quel', () => {
    const quote: ShopQuoteView = {
      ...QUOTE,
      discountCents: 200,
      voucherDiscountCents: 100,
      deliveryFeeCents: 500,
      lateFeeCents: 300,
      vat: [],
      pretaxCents: 1_234,
      totalCents: 9_999,
    };

    expect(shownCartTotalCents(quote, true)).toBe(1_234);
  });
});
