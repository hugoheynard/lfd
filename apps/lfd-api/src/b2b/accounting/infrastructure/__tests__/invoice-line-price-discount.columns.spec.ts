import {
  priceDiscountOfNoteLine,
  priceDiscountOfOrderLine,
} from "../invoice-line-price-discount.columns.js";

/** La trace de prix relue des colonnes de `order_lines` (plan `plan-remise-par-ligne.md`, § 18.6). */

const STEP = { stage: "promotion", ruleId: "p1", label: "Printemps", resultMillicents: 81_840 };

function row(overrides: Partial<Parameters<typeof priceDiscountOfOrderLine>[0]> = {}) {
  return {
    sku: "CROI",
    unitPriceMillicents: 81_840,
    basePriceMillicents: 93_000,
    pricingSteps: [STEP],
    pricingFloored: false,
    pricingClampedToZero: false,
    ...overrides,
  };
}

describe("priceDiscountOfOrderLine", () => {
  it("lit le prix brut et le nom de la promotion", () => {
    expect(priceDiscountOfOrderLine(row())).toEqual({
      grossUnitPriceMillicents: 93_000,
      labels: ["Printemps"],
    });
  });

  it("se tait sur une ligne sans trace ou à la trace illisible", () => {
    expect(priceDiscountOfOrderLine(row({ basePriceMillicents: null }))).toBeUndefined();
    expect(priceDiscountOfOrderLine(row({ pricingSteps: [{ stage: "inconnu" }] }))).toBeUndefined();
  });
});

describe("priceDiscountOfNoteLine", () => {
  it("reprend la remise de la ligne de commande au même article et au même prix", () => {
    expect(priceDiscountOfNoteLine([row()], { sku: "CROI", unitPriceMillicents: 81_840 })).toEqual({
      grossUnitPriceMillicents: 93_000,
      labels: ["Printemps"],
    });
  });

  it("se tait quand aucune ligne ne correspond, ou quand deux remises diffèrent", () => {
    expect(
      priceDiscountOfNoteLine([row()], { sku: "PAIN", unitPriceMillicents: 81_840 }),
    ).toBeUndefined();
    const other = row({ pricingSteps: [{ ...STEP, label: "Autre" }] });
    expect(
      priceDiscountOfNoteLine([row(), other], { sku: "CROI", unitPriceMillicents: 81_840 }),
    ).toBeUndefined();
  });
});
