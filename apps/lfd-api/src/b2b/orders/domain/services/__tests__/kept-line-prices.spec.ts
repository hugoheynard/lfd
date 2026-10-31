import { ttcCentsFromHtMillicents } from "@lfd/money";

import type { OrderLineInput, OrderLineSnapshot } from "../../value-objects/order-line.js";
import { keptLineRefusals } from "../kept-line-prices.js";
import type { KeptQuantityChange } from "../revised-lines.js";

/**
 * **Une modification ne change jamais un prix convenu en silence**
 * (`documentation/promotions/plan-remises-acquises.md`, § 10.1) : une ligne
 * déjà commandée dont la quantité change est retarifée au moment, et comparée
 * à son figé.
 */

function kept(
  sku: string,
  unitPriceMillicents: number,
  over: Partial<OrderLineSnapshot> = {},
): OrderLineSnapshot {
  return {
    sku,
    productName: `Article ${sku}`,
    unitPriceMillicents,
    vatRate: 5.5,
    saleUnit: "piece",
    quantity: 2,
    lineTotalCents: 0,
    unitPriceTtcCents: null,
    lineTotalTtcCents: null,
    pricing: null,
    allergens: null,
    pickupDiscountEligible: true,
    productId: null,
    categoryId: null,
    madeToOrder: null,
    ...over,
  };
}

function now(sku: string, unitPriceMillicents: number, vatRate = 5.5): OrderLineInput {
  return {
    sku,
    productName: `Article ${sku}`,
    unitPriceMillicents,
    vatRate,
    quantity: 50,
    saleUnit: "piece",
  };
}

function change(sku: string, quantity: number, saleUnit: "piece" | "weight" = "piece") {
  const moved: KeptQuantityChange = { sku, productName: `Article ${sku}`, saleUnit, quantity };
  return moved;
}

describe("keptLineRefusals", () => {
  it("laisse passer une quantité dont le prix du moment est le prix figé", () => {
    const refusals = keptLineRefusals(
      [kept("VIE-001", 180_000)],
      [change("VIE-001", 50)],
      new Map([["VIE-001", now("VIE-001", 180_000)]]),
      "line_ht",
    );

    expect(refusals).toEqual([]);
  });

  /**
   * La faille du § 8.1 : 2 pièces au prix d'une promotion, puis 50 après sa
   * fin — les 50 étaient servies au prix promotionnel.
   */
  it("refuse une hausse quand la promotion est finie (prix du moment plus haut)", () => {
    const refusals = keptLineRefusals(
      [kept("VIE-001", 90_000)],
      [change("VIE-001", 50)],
      new Map([["VIE-001", now("VIE-001", 120_000)]]),
      "line_ht",
    );

    expect(refusals).toEqual([
      {
        kind: "price_changed",
        sku: "VIE-001",
        productName: "Article VIE-001",
        saleUnit: "piece",
        frozen: { unitPriceMillicents: 90_000, vatRate: 5.5, unitPriceTtcCents: null },
        current: { unitPriceMillicents: 120_000, vatRate: 5.5, unitPriceTtcCents: null },
      },
    ]);
  });

  it("refuse une baisse qui quitte un palier de volume (prix du moment plus haut)", () => {
    const refusals = keptLineRefusals(
      [kept("VIE-001", 150_000, { quantity: 100 })],
      [change("VIE-001", 20)],
      new Map([["VIE-001", now("VIE-001", 200_000)]]),
      "line_ht",
    );

    expect(refusals.map((refusal) => refusal.kind)).toEqual(["price_changed"]);
  });

  it("refuse aussi un prix du moment PLUS BAS : aucun prix convenu ne bouge en silence", () => {
    const refusals = keptLineRefusals(
      [kept("VIE-001", 200_000)],
      [change("VIE-001", 30)],
      new Map([["VIE-001", now("VIE-001", 180_000)]]),
      "line_ht",
    );

    expect(refusals).toHaveLength(1);
  });

  it("refuse un taux de TVA changé, même à prix HT égal", () => {
    const refusals = keptLineRefusals(
      [kept("VIE-001", 200_000)],
      [change("VIE-001", 3)],
      new Map([["VIE-001", now("VIE-001", 200_000, 10)]]),
      "line_ht",
    );

    expect(refusals).toHaveLength(1);
  });

  it("au poids, compare le prix au kilo", () => {
    const line = kept("FRO-001", 2_400_000, { saleUnit: "weight", quantity: 500 });
    const priced = { ...now("FRO-001", 2_400_000), saleUnit: "weight" as const, quantity: 750 };

    expect(
      keptLineRefusals(
        [line],
        [change("FRO-001", 750, "weight")],
        new Map([["FRO-001", priced]]),
        "line_ht",
      ),
    ).toEqual([]);
    expect(
      keptLineRefusals(
        [line],
        [change("FRO-001", 750, "weight")],
        new Map([["FRO-001", { ...priced, unitPriceMillicents: 2_600_000 }]]),
        "line_ht",
      ).map((refusal) => refusal.saleUnit),
    ).toEqual(["weight"]);
  });

  describe("exact_ht (particulier)", () => {
    const label = ttcCentsFromHtMillicents(180_000, 5.5);

    it("compare aussi l'étiquette TTC scellée", () => {
      const refusals = keptLineRefusals(
        [kept("VIE-001", 180_000, { unitPriceTtcCents: label })],
        [change("VIE-001", 4)],
        new Map([["VIE-001", now("VIE-001", 180_000)]]),
        "exact_ht",
      );

      expect(refusals).toEqual([]);
    });

    it("refuse une étiquette scellée qui ne correspond plus, et rend les deux étiquettes", () => {
      const refusals = keptLineRefusals(
        [kept("VIE-001", 180_000, { unitPriceTtcCents: label + 1 })],
        [change("VIE-001", 4)],
        new Map([["VIE-001", now("VIE-001", 180_000)]]),
        "exact_ht",
      );

      expect(refusals).toEqual([
        {
          kind: "price_changed",
          sku: "VIE-001",
          productName: "Article VIE-001",
          saleUnit: "piece",
          frozen: { unitPriceMillicents: 180_000, vatRate: 5.5, unitPriceTtcCents: label + 1 },
          current: { unitPriceMillicents: 180_000, vatRate: 5.5, unitPriceTtcCents: label },
        },
      ]);
    });
  });

  it("refuse par son nom un article sorti du catalogue", () => {
    const refusals = keptLineRefusals(
      [kept("VIE-001", 180_000)],
      [change("VIE-001", 1)],
      new Map([["VIE-001", null]]),
      "line_ht",
    );

    expect(refusals).toEqual([
      { kind: "withdrawn", sku: "VIE-001", productName: "Article VIE-001", saleUnit: "piece" },
    ]);
  });

  it("traite un SKU non retarifé comme retiré : on ne garde pas un prix qu'on n'a pas revérifié", () => {
    const refusals = keptLineRefusals(
      [kept("VIE-001", 180_000)],
      [change("VIE-001", 1)],
      new Map(),
      "line_ht",
    );

    expect(refusals.map((refusal) => refusal.kind)).toEqual(["withdrawn"]);
  });
});
