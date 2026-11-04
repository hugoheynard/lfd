import type { ShopQuoteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { quoteChangesOf } from './quote-changes';

const LINE = {
  sku: 'VIE-001',
  quantity: 2,
  saleUnit: 'piece' as const,
  unitPriceMillicents: 150_000,
  lineTotalCents: 300,
  lineTotalTtcCents: 317,
  vatRatePercent: 5.5,
};

const A: ShopQuoteView = {
  lines: [LINE],
  subtotalHtCents: 300,
  discountCents: 0,
  discountAdjustment: null,
  voucherDiscountCents: 0,
  deliveryFeeCents: 0,
  deliveryVatMode: 'standard',
  vat: [{ rate: 5.5, amountCents: 17 }],
  totalCents: 317,
};

const nameOf = (sku: string): string => (sku === 'VIE-001' ? 'Viennoise' : sku);

describe('quoteChangesOf — ce qui a bougé entre deux devis (plan total vu, T3)', () => {
  it('deux devis identiques : rien', () => {
    expect(quoteChangesOf(A, { ...A }, nameOf)).toEqual([]);
  });

  it('la surtaxe apparue se dit avec son montant', () => {
    expect(quoteChangesOf(A, { ...A, lateFeeCents: 500 }, nameOf)).toEqual([
      { kind: 'lateFeeAppeared', amountCents: 500 },
    ]);
  });

  it('une surtaxe qui change se nomme seulement', () => {
    expect(
      quoteChangesOf({ ...A, lateFeeCents: 500 }, { ...A, lateFeeCents: 700 }, nameOf),
    ).toEqual([{ kind: 'lateFee' }]);
  });

  it('nomme le port, la remise, le bon et la TVA, chacun pour lui', () => {
    const after: ShopQuoteView = {
      ...A,
      deliveryFeeCents: 900,
      discountCents: 30,
      voucherDiscountCents: 100,
      vat: [{ rate: 5.5, amountCents: 18 }],
    };
    expect(quoteChangesOf(A, after, nameOf).map((change) => change.kind)).toEqual([
      'deliveryFee',
      'discount',
      'voucher',
      'vat',
    ]);
  });

  it('dit la remise finie et la ligne retirée que le devis neuf rapporte', () => {
    const label = { fr: 'Goûter', en: 'Snack', it: 'Merenda' };
    const after: ShopQuoteView = {
      ...A,
      endedDiscounts: [{ label, endedAt: '2026-11-03T18:00:00.000Z' }],
      removedLines: [
        { sku: 'PAIN-1', name: 'Pain', reason: 'sale_unit_changed', saleUnit: 'weight' },
      ],
    };
    expect(quoteChangesOf(A, after, nameOf)).toEqual([
      { kind: 'discountEnded', label },
      { kind: 'lineRemoved', name: 'Pain' },
    ]);
  });

  it('nomme l’article dont le prix a changé, à quantité égale', () => {
    const after: ShopQuoteView = {
      ...A,
      lines: [
        { ...LINE, unitPriceMillicents: 160_000, lineTotalCents: 320, lineTotalTtcCents: 338 },
      ],
    };
    expect(quoteChangesOf(A, after, nameOf)).toContainEqual({
      kind: 'linePrice',
      name: 'Viennoise',
    });
  });
});
