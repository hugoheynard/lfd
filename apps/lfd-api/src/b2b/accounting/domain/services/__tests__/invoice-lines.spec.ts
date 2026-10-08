import { lineTotalCents } from "@lfd/money";

import { aggregateInvoiceLines } from "../invoice-lines.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";

/**
 * Les dates ne sont que comparées entre elles : l'agrégation ne lit aucune
 * horloge. Les instants de passation partent de l'époque Unix.
 */
const PRICE = 33_333;
const QUANTITY = 1;

function bonOf(reference: string, minute: number, date: string): FrozenInvoiceOrder {
  const cents = lineTotalCents(PRICE, QUANTITY);
  return {
    reference,
    createdAt: new Date(minute * 60_000),
    requestedDeliveryDate: date,
    lines: [
      {
        sku: "BAG-001",
        productNameSnapshot: "Baguette",
        unitPriceMillicents: PRICE,
        vatRate: "5.50",
        quantity: QUANTITY,
        lineTotalCents: cents,
      },
    ],
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: null,
    vatCents: 0,
    totalCents: cents,
  };
}

describe("aggregateInvoiceLines — le montant repris des bons (F6)", () => {
  /**
   * Régression F6 : 3 bons d'une baguette à 0,33333 € arrondissent chacun
   * 33,333 → 33, soit 99 ; l'ancien calcul arrondissait 99,999 → 100 une
   * fois, et la facture différait des bons d'un centime de HT.
   */
  it("le montant d'une ligne agrégée est la somme des montants figés des bons", () => {
    const orders = [
      bonOf("CMD-1", 1, "2026-10-02"),
      bonOf("CMD-2", 2, "2026-10-05"),
      bonOf("CMD-3", 3, "2026-10-09"),
    ];
    const ordersSum = orders.reduce((total, o) => total + (o.lines[0]?.lineTotalCents ?? 0), 0);

    const [line, ...rest] = aggregateInvoiceLines(orders);

    expect(rest).toEqual([]);
    expect(ordersSum).toBe(99);
    expect(lineTotalCents(PRICE, 3)).toBe(100);
    expect(line).toMatchObject({
      sku: "BAG-001",
      unitPriceMillicents: PRICE,
      vatRate: 5.5,
      label: "Baguette",
      unitCode: "H87",
      quantity: 3,
      amountCents: ordersSum,
      ordersLineTotalCents: ordersSum,
      firstDeliveryDate: "2026-10-02",
      lastDeliveryDate: "2026-10-09",
    });
  });
});
