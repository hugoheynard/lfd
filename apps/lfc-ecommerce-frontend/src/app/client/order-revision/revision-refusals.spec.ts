import type { OrderRevisionQuoteLineView, OrderRevisionQuoteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ORDERS_FR } from '../copy/screens/orders.copy';
import { hasRefusal, refusalsBySku } from './revision-refusals';

const COPY = ORDERS_FR.revision.refusals;

const LINE: OrderRevisionQuoteLineView = {
  sku: 'PAIN-1',
  productName: 'Campagne',
  quantity: 1500,
  saleUnit: 'weight',
  unitPriceMillicents: 600_000,
  vatRate: 5.5,
  lineTotalCents: 900,
  priceFrozen: true,
  refusal: null,
};

function quoteWith(
  lines: readonly OrderRevisionQuoteLineView[],
  discountRefusals: OrderRevisionQuoteView['discountRefusals'] = [],
): OrderRevisionQuoteView {
  return {
    revision: 1,
    lines,
    subtotalCents: 0,
    discountCents: 0,
    deliveryFeeCents: 0,
    lateFeeCents: 0,
    voucherDiscountCents: 0,
    vatCents: 0,
    totalCents: 0,
    previousTotalCents: 0,
    differenceCents: 0,
    changes: ['lines'],
    discountRefusals,
  };
}

describe('refusalsBySku', () => {
  it('dit les deux prix HT au kilo d’une commande pro', () => {
    const quote = quoteWith([
      {
        ...LINE,
        refusal: {
          kind: 'price_changed',
          frozen: { unitPriceMillicents: 600_000, vatRate: 5.5, unitPriceTtcCents: null },
          current: { unitPriceMillicents: 612_500, vatRate: 5.5, unitPriceTtcCents: null },
        },
      },
    ]);
    expect(refusalsBySku(quote, COPY, 'fr').get('PAIN-1')).toEqual([
      'Changer la quantité change son prix : 6,00 € HT le kg → 6,125 € HT le kg — gardez la quantité commandée, ou annulez et passez une nouvelle commande.',
    ]);
    expect(hasRefusal(quote)).toBe(true);
  });

  it('dit un article retiré, et une remise sans libellé avec son seuil en poids', () => {
    const quote = quoteWith(
      [{ ...LINE, refusal: { kind: 'withdrawn' } }],
      [{ kind: 'below_threshold', label: null, minQuantity: 2000, sku: 'PAIN-1', quantity: 1500 }],
    );
    const said = refusalsBySku(quote, COPY, 'fr').get('PAIN-1') ?? [];
    expect(said[0]).toBe(COPY.lineWithdrawn);
    expect(said[1]).toBe('Cette modification ferait perdre une remise (dès 2 kg).');
  });

  it('ne dit rien et ne bloque rien sans refus', () => {
    const quote = quoteWith([LINE]);
    expect(refusalsBySku(quote, COPY, 'fr').size).toBe(0);
    expect(hasRefusal(quote)).toBe(false);
  });
});
