import type {
  CompanyOrderSummaryView,
  OrderSummaryBottomView,
  OrderSummaryOrdersPretaxView,
} from '@lfd/contracts';

/** Un bas de facture, en centimes. */
export const BOTTOM: OrderSummaryBottomView = {
  subtotalCents: 12_000,
  discountCents: 1_250,
  voucherDiscountCents: 0,
  deliveryFeeCents: 800,
  lateFeeCents: 0,
  vat: [
    { rate: 5.5, amountCents: 550 },
    { rate: 20, amountCents: 300 },
  ],
  unventilatedVatCents: 0,
  totalCents: 12_400,
};

/** La somme des bons : sous-total − remises + livraison. */
export const ORDERS_PRETAX: OrderSummaryOrdersPretaxView = {
  pretaxCents: 11_550,
  gapCents: -450,
  cappedDiscountCents: 0,
};

/** Une société seule, une commande exclue — comme le serveur la rend. */
export const SUMMARY: CompanyOrderSummaryView = {
  amountsAt: 'placement',
  companies: [
    {
      companyId: 'co_1',
      name: 'Maison mère',
      orderCount: 2,
      products: [{ sku: 'VIE-001', name: 'Croissant', quantity: 12, htCents: 12_000 }],
      bottom: BOTTOM,
      ordersPretax: ORDERS_PRETAX,
      orders: [
        {
          orderId: 'o1',
          orderNumber: 'CMD-001',
          day: '2026-10-07',
          fulfillmentMethod: 'delivery',
          author: { kind: 'team' },
          pretaxCents: 6_300,
        },
        {
          orderId: 'o2',
          orderNumber: 'CMD-002',
          day: null,
          fulfillmentMethod: 'pickup',
          author: { kind: 'customer', name: 'Léa Martin' },
          pretaxCents: 5_250,
        },
      ],
    },
  ],
  total: {
    orderCount: 2,
    products: [{ sku: 'VIE-001', name: 'Croissant', quantity: 12, htCents: 12_000 }],
    bottom: BOTTOM,
    ordersPretax: ORDERS_PRETAX,
  },
  excluded: [{ orderId: 'o9', orderNumber: 'CMD-009', reason: 'cancelled' }],
};
