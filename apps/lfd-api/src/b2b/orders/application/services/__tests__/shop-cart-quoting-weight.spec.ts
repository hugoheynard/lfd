import { millicentsFromCents } from "@lfd/money";

import { CompanyMercuriale } from "../../../../pricing/domain/entities/company-mercuriale.js";
import type { PriceRule } from "../../../../pricing/domain/price-rule.js";
import {
  SaleUnitMismatchError,
  WeightBelowMinimumError,
  WeightOffStepError,
} from "../../../domain/errors/sale-quantity-errors.js";
import { catalogItem, quotingOf, type QuotingSetup } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis d'une ligne au poids** — plan `documentation/pricing/plan-vente-au-poids.md`,
 * P3 : la quantité en grammes, le prix au kilo, le total = prix au kilo ×
 * grammes / 1000 arrondi une fois ; les décisions globales et de famille
 * écartées, la mercuriale appliquée. Les dates ne sont comparées qu'entre
 * elles (la fenêtre de la mercuriale contient l'instant fixe du devis).
 */

/** Saumon gravlax : 12,34567 € HT le kilo, par 50 g, à partir de 200 g. */
const SALMON = {
  ...catalogItem("SAU-001", "Saumon gravlax", 1_234_567, 5.5),
  saleUnit: "weight" as const,
  weightMinGrams: 200,
  weightStepGrams: 50,
};
const CROISSANT = catalogItem("VIE-001", "Croissant", 200_000, 5.5);
const CATALOG = [SALMON, CROISSANT];

const PRO = { companyId: "co_pro", buyerUserId: "user_pro" } as const;
const NO_COMPANY = { companyId: null, buyerUserId: null } as const;

function quoting(over: Partial<QuotingSetup> = {}) {
  return quotingOf({ catalog: CATALOG, companyStatus: "active", ...over });
}

function weighed(quantity: number) {
  return { sku: "SAU-001", quantity, saleUnit: "weight" as const };
}

/** −10 % sur toute une portée, ouverte à tous. */
function tenPercentOn(scope: PriceRule["scope"]): PriceRule {
  return {
    id: `promo-${scope.type}`,
    stage: "promotion",
    scope,
    audience: { type: "all", id: null },
    minQuantity: null,
    label: "Promotion",
    stacksOverMercuriale: false,
    nature: "alter",
    alteration: { direction: "decrease", mode: "percent", bp: 1_000 },
    validFrom: new Date("2020-01-01T00:00:00.000Z"),
    validTo: null,
    suspendedFrom: null,
  };
}

describe("ShopCartQuoting — une ligne au poids", () => {
  it("chiffre un pro : prix au kilo × grammes / 1000, arrondi une fois", async () => {
    const { view } = await quoting().quote({
      ...PRO,
      payload: { lines: [weighed(1_250)], fulfillment: null },
    });

    // 12,34567 × 1,25 = 15,4320875 € → 15,43 €.
    expect(view.lines).toEqual([
      expect.objectContaining({
        sku: "SAU-001",
        quantity: 1_250,
        saleUnit: "weight",
        unitPriceMillicents: 1_234_567,
        lineTotalCents: 1_543,
      }),
    ]);
  });

  it("chiffre un particulier en TTC : l'étiquette du kilo × grammes / 1000", async () => {
    const { view } = await quoting({ companyStatus: null }).quote({
      ...NO_COMPANY,
      payload: { lines: [weighed(1_250)], fulfillment: null },
    });

    // Étiquette : 12,34567 € × 1,055 = 13,0246… → 13,02 € le kilo ;
    // × 1,25 = 16,275 → 16,28 € (la moitié vers le haut).
    expect(view.lines[0]).toMatchObject({ saleUnit: "weight", lineTotalTtcCents: 1_628 });
    expect(view.totalCents).toBe(1_628);
  });

  it("écarte une règle globale et une règle de famille, que le croissant prend", async () => {
    const rules = [
      tenPercentOn({ type: "global", id: null }),
      tenPercentOn({ type: "category", id: "fam-pain" }),
    ];
    const { view } = await quoting({ decisions: { rules } }).quote({
      ...PRO,
      payload: {
        lines: [weighed(1_000), { sku: "VIE-001", quantity: 10 }],
        fulfillment: null,
      },
    });

    expect(view.lines[0]).toMatchObject({ sku: "SAU-001", unitPriceMillicents: 1_234_567 });
    expect(view.lines[1]).toMatchObject({ sku: "VIE-001", unitPriceMillicents: 180_000 });
  });

  it("applique la mercuriale du client, son palier en grammes", async () => {
    const mercuriale = CompanyMercuriale.pose(
      "merc_1",
      {
        companyId: "co_pro",
        label: "Mercuriale 2026",
        lines: [
          {
            sku: "SAU-001",
            tiers: [{ minQuantity: 1_000, unitPriceMillicents: millicentsFromCents(1_000) }],
          },
        ],
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validTo: null,
      },
      "staff_test",
    );
    const { view } = await quoting({ decisions: { mercuriale } }).quote({
      ...PRO,
      payload: { lines: [weighed(1_500)], fulfillment: null },
    });

    // 10,00 € le kilo négocié × 1,5 kg.
    expect(view.lines[0]).toMatchObject({ unitPriceMillicents: 1_000_000, lineTotalCents: 1_500 });
  });

  it("refuse une ligne sans unité sur un article au poids — jamais relue en grammes", async () => {
    await expect(
      quoting().quote({
        ...PRO,
        payload: { lines: [{ sku: "SAU-001", quantity: 1_250 }], fulfillment: null },
      }),
    ).rejects.toThrow(SaleUnitMismatchError);
  });

  it("refuse un poids hors du pas, ou sous le minimum, plutôt que de le corriger", async () => {
    await expect(
      quoting().quote({ ...PRO, payload: { lines: [weighed(1_230)], fulfillment: null } }),
    ).rejects.toThrow(WeightOffStepError);
    await expect(
      quoting().quote({ ...PRO, payload: { lines: [weighed(150)], fulfillment: null } }),
    ).rejects.toThrow(WeightBelowMinimumError);
  });

  it("refuse des grammes sur un article à la pièce", async () => {
    await expect(
      quoting().quote({
        ...PRO,
        payload: {
          lines: [{ sku: "VIE-001", quantity: 500, saleUnit: "weight" }],
          fulfillment: null,
        },
      }),
    ).rejects.toThrow(SaleUnitMismatchError);
  });
});
