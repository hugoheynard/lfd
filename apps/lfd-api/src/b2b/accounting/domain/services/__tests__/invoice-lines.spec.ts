import { lineTotalCents, pieces } from "@lfd/money";

import { aggregateInvoiceLines } from "../invoice-lines.js";
import type { FrozenInvoiceOrder } from "../invoice-dossier.types.js";

/**
 * Les dates ne sont que comparées entre elles : l'agrégation ne lit aucune
 * horloge. Les instants de passation partent de l'époque Unix.
 */
const PRICE = 33_333;
const QUANTITY = 1;

function bonOf(reference: string, minute: number, date: string): FrozenInvoiceOrder {
  const cents = lineTotalCents(PRICE, pieces(QUANTITY));
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
        saleUnit: "piece",
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
  //
  // Depuis le § 18.6 du plan `plan-remise-par-ligne.md` (2026-11-01), ce cas ne
  // se regroupe plus : 0,33333 € × 3 = 1,00 € ≠ 0,99 €, et une ligne unique
  // aurait affiché un prix (ou un montant) que personne n'a payé. Le total, lui,
  // reste Σ des bons.
  it("trois bons qui ne recomposent pas le prix × la quantité font trois lignes, au même total", () => {
    const orders = [
      bonOf("ORD-1", 1, "2026-10-02"),
      bonOf("ORD-2", 2, "2026-10-05"),
      bonOf("ORD-3", 3, "2026-10-09"),
    ];
    const ordersSum = orders.reduce((total, o) => total + (o.lines[0]?.lineTotalCents ?? 0), 0);

    const lines = aggregateInvoiceLines(orders);

    expect(ordersSum).toBe(99);
    expect(lineTotalCents(PRICE, pieces(3))).toBe(100);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.unitPriceMillicents === PRICE && l.amountCents === 33)).toBe(true);
    expect(lines.reduce((total, l) => total + l.amountCents, 0)).toBe(ordersSum);
    expect(lines.map((l) => l.firstDeliveryDate)).toEqual([
      "2026-10-02",
      "2026-10-05",
      "2026-10-09",
    ]);
  });
});

describe("aggregateInvoiceLines — un reste livré à un autre jour (plan E7 reliquat, L5b)", () => {
  it("la ligne d'un reste porte le jour de son envoi, pas celui du bon", () => {
    const bon = bonOf("ORD-1", 1, "2026-10-02");
    const [first] = bon.lines;
    if (first === undefined) {
      throw new TypeError("ligne absente de la fixture");
    }
    const twoShipments = { ...bon, lines: [first, { ...first, deliveryDate: "2026-10-04" }] };

    const [line] = aggregateInvoiceLines([twoShipments]);

    expect(line).toMatchObject({
      quantityThousandths: 2_000,
      firstDeliveryDate: "2026-10-02",
      lastDeliveryDate: "2026-10-04",
    });
  });
});
