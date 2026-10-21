import type { CompanyOrderSummaryView, OrderSummaryBottomView } from '@lfd/contracts';

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
    },
  ],
  total: {
    orderCount: 2,
    products: [{ sku: 'VIE-001', name: 'Croissant', quantity: 12, htCents: 12_000 }],
    bottom: BOTTOM,
  },
  excluded: [{ orderId: 'o9', orderNumber: 'CMD-009', reason: 'cancelled' }],
};
