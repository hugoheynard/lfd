import type { InvoiceDossierOrderView, InvoiceDossierView } from '@lfd/contracts';

/** Un bon minimal, retiré au comptoir, ventilé. */
export function dossierOrder(
  overrides: Partial<InvoiceDossierOrderView> = {},
): InvoiceDossierOrderView {
  return {
    reference: 'CMD-1',
    placedAt: '2026-10-02T08:00:00.000Z',
    requestedDeliveryDate: '2026-10-03',
    lines: [],
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: 'standard',
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: [],
    vatCents: 0,
    totalCents: 0,
    place: { method: 'pickup', label: 'Labo', address: '1 rue du Four' },
    history: [],
    actualDeliveryDay: null,
    ...overrides,
  };
}

/** Un dossier sans rien à signaler ; chaque test pose ce qu'il éprouve. */
export function dossier(overrides: Partial<InvoiceDossierView> = {}): InvoiceDossierView {
  return {
    companyId: 'c1',
    companyName: 'Café du Port',
    cycle: {
      month: '2026-10',
      startsAt: '2026-09-30T22:00:00.000Z',
      closesAt: '2026-10-31T23:00:00.000Z',
      inProgress: false,
    },
    scope: 'Les bons passés au compte dans le mois.',
    neverHandedOver: [],
    invoice: {
      lines: [
        {
          sku: 'PAIN-1',
          unitPriceMillicents: 123_450,
          vatRate: 5.5,
          label: 'Pain de campagne',
          otherLabels: [],
          quantity: 3,
          amountCents: 370,
          ordersLineTotalCents: 371,
          firstDeliveryDate: '2026-10-03',
          lastDeliveryDate: '2026-10-17',
        },
      ],
      companyDiscountCents: 0,
      voucherDiscountCents: 0,
      lateFeeCents: 0,
      deliveries: [],
      vat: {
        categories: [],
        goodsHtCents: 370,
        allowancesCents: 0,
        chargesCents: 0,
        taxableBaseCents: 370,
        vatCents: 20,
        totalCents: 390,
      },
      totalCents: 390,
    },
    orders: [dossierOrder()],
    ordersTotalCents: 391,
    differenceCents: -1,
    gaps: {
      lineRounding: [
        { sku: 'PAIN-1', unitPriceMillicents: 123_450, vatRate: 5.5, gapCents: -1 },
        { sku: 'PAIN-2', unitPriceMillicents: 100_000, vatRate: 5.5, gapCents: 0 },
      ],
      lineRoundingCents: -1,
      vatRounding: [],
      vatRoundingCents: 0,
      unventilatedVat: { invoiceVatCents: 0, ordersVatCents: 0, gapCents: 0 },
      inconsistentOrdersCents: 0,
      totalCents: -1,
    },
    inconsistentOrders: [],
    threeGapInvariantHolds: true,
    otherMonthOrders: [],
    ordersWithoutDate: [],
    ...overrides,
  };
}
