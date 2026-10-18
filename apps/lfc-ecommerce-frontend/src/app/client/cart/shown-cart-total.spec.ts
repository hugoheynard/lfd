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
  it('TTC hors compte, HT au compte — le total moins la TVA du devis', () => {
    expect(shownCartTotalCents(QUOTE, false)).toBe(2_155);
    expect(shownCartTotalCents(QUOTE, true)).toBe(2_000);
  });
});
