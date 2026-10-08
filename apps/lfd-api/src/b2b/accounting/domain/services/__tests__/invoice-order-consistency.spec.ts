import { lineTotalCents, ventilateVat } from "@lfd/money";

import { simulateInvoiceDossier } from "../invoice-dossier.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";

/** Un bon figé comme à la passation ; `cappedDiscount` simule une remise bornée au total. */
function bon(
  reference: string,
  qty: number,
  discount: number,
  cappedTo?: number,
): FrozenInvoiceOrder {
  const line = {
    sku: "BAG-001",
    productNameSnapshot: "Baguette",
    unitPriceMillicents: 33_333,
    vatRate: "5.50",
    quantity: qty,
    lineTotalCents: lineTotalCents(33_333, qty),
  };
  const applied = cappedTo ?? discount;
  const ventilation = ventilateVat({
    lines: [{ htCents: line.lineTotalCents, vatRate: 5.5 }],
    discountCents: applied,
    extras: [],
  });
  return {
    reference,
    createdAt: new Date(0),
    requestedDeliveryDate: null,
    lines: [line],
    // Le bon garde la remise demandée, mais son total a été calculé sur la remise bornée.
    discountCents: discount,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: ventilation.vat,
    vatCents: ventilation.vatTotalCents,
    totalCents: ventilation.totalCents,
  };
}

describe("simulateInvoiceDossier — les bons incohérents", () => {
  it("des bons cohérents : rien de signalé, l'invariant des trois écarts tient", () => {
    const dossier = simulateInvoiceDossier([bon("CMD-1", 7, 50), bon("CMD-2", 3, 0)]);

    expect(dossier.inconsistentOrders).toEqual([]);
    expect(dossier.threeGapInvariantHolds).toBe(true);
    expect(dossier.gaps.inconsistentOrdersCents).toBe(0);
  });

  it("un bon à remise plafonnée est signalé, et la somme des quatre termes reste exacte", () => {
    const capped = bon("CMD-9", 2, 500, 60);
    const dossier = simulateInvoiceDossier([bon("CMD-1", 7, 50), capped]);

    const recomposed = lineTotalCents(33_333, 2) - capped.discountCents + capped.vatCents;
    expect(dossier.inconsistentOrders).toEqual([
      {
        reference: "CMD-9",
        recomposedTotalCents: recomposed,
        totalCents: capped.totalCents,
        gapCents: recomposed - capped.totalCents,
      },
    ]);
    expect(dossier.threeGapInvariantHolds).toBe(false);
    const { gaps } = dossier;
    expect(
      gaps.vatRoundingCents + gaps.unventilatedVat.gapCents + gaps.inconsistentOrdersCents,
    ).toBe(dossier.invoice.totalCents - dossier.ordersTotalCents);
    expect(gaps.totalCents).toBe(dossier.differenceCents);
  });
});
