import { lineTotalCents, pieces } from "@lfd/money";

import { aggregateInvoiceLines } from "../invoice-lines.js";
import type { FrozenInvoiceLine, FrozenInvoiceOrder } from "../invoice-dossier.types.js";
import type { InvoicePriceDiscount } from "../invoice-price-discount.js";

/**
 * **Pas de prix moyen** — plan `plan-remise-par-ligne.md`, § 18.6, point 3.
 * Aucune horloge lue : les instants partent de l'époque Unix.
 */

/** 0,93 € − 12 % = 0,8184 € HT. */
const NET = 81_840;
const PROMO: InvoicePriceDiscount = { grossUnitPriceMillicents: 93_000, labels: ["Printemps"] };

function lineOf(
  quantity: number,
  price = NET,
  priceDiscount?: InvoicePriceDiscount,
): FrozenInvoiceLine {
  return {
    sku: "CROI",
    productNameSnapshot: "Croissant",
    unitPriceMillicents: price,
    vatRate: "5.50",
    quantity,
    saleUnit: "piece",
    lineTotalCents: lineTotalCents(price, pieces(quantity)),
    ...(priceDiscount === undefined ? {} : { priceDiscount }),
  };
}

function bonOf(index: number, line: FrozenInvoiceLine): FrozenInvoiceOrder {
  return {
    reference: `ORD-${String(index)}`,
    createdAt: new Date(index * 60_000),
    requestedDeliveryDate: null,
    lines: [line],
    discountCents: 0,
    voucherDiscountCents: 0,
    deliveryFeeCents: 0,
    deliveryVatMode: null,
    lateFeeCents: 0,
    lateFeeVatRate: null,
    vatShares: null,
    vatCents: 0,
    totalCents: line.lineTotalCents,
  };
}

describe("aggregateInvoiceLines — pas de prix moyen (§ 18.6)", () => {
  /**
   * Régression : trente bons de 5 pièces à 0,8184 € se regroupaient en une
   * ligne de 150 pièces à 122,70 €, dont le prix « payé » était rattrapé à
   * 0,818 € — un prix que personne n'avait payé (150 × 0,8184 = 122,76 €).
   */
  it("trente bons de 5 pièces à 0,8184 € : une ligne par bon à 0,8184 €, total 30 × 4,09 €", () => {
    const orders = Array.from({ length: 30 }, (_, i) => bonOf(i, lineOf(5, NET, PROMO)));

    const lines = aggregateInvoiceLines(orders);

    expect(lineTotalCents(NET, pieces(5))).toBe(409);
    expect(lineTotalCents(NET, pieces(150))).toBe(12_276);
    expect(lines).toHaveLength(30);
    expect(lines.every((l) => l.unitPriceMillicents === NET && l.amountCents === 409)).toBe(true);
    expect(lines.every((l) => l.priceDiscount === PROMO)).toBe(true);
    expect(lines.reduce((total, l) => total + l.amountCents, 0)).toBe(30 * 409);
  });

  it("des bons qui recomposent le prix × la quantité se regroupent en une ligne", () => {
    const orders = [bonOf(1, lineOf(5, 93_000)), bonOf(2, lineOf(3, 93_000))];

    const lines = aggregateInvoiceLines(orders);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ quantityThousandths: 8_000, amountCents: 744 });
  });

  it("une ligne remisée ne se fond pas dans une ligne au même prix net sans remise", () => {
    const orders = [bonOf(1, lineOf(5, 80_000, PROMO)), bonOf(2, lineOf(5, 80_000))];

    const lines = aggregateInvoiceLines(orders);

    expect(lines.map((l) => l.priceDiscount)).toEqual([PROMO, undefined]);
  });
});
