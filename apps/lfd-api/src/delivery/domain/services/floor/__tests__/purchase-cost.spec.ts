import { PurchaseCostOverflowError } from "../../../errors/delivery-purchase-table-errors.js";
import { purchaseCost } from "../purchase-cost.js";

describe("purchaseCost — coûts d'une case, centimes HT entiers (B-D4)", () => {
  it("équipement = bacs × prix unitaire, total = véhicule + équipement, par litre arrondi", () => {
    // 6 × 1 290 = 7 740 ; 1 000 000 + 7 740 = 1 007 740 ; ÷ 180 L = 5 598,56 → 5 599.
    expect(
      purchaseCost({
        total: 6,
        usefulLiters: 180,
        vehiclePriceCents: 1_000_000,
        unitPriceCents: 1_290,
      }),
    ).toEqual({ equipmentCostCents: 7_740, totalCostCents: 1_007_740, costPerLiterCents: 5_599 });
  });

  it.each([
    [1, 2, 1], // 0,5 → moitié vers le haut
    [1, 3, 0], // 0,33 → 0
    [2, 3, 1], // 0,67 → 1
    [5, 2, 3], // 2,5 → 3
  ])("arrondit %i centimes sur %i litres à %i", (cents, liters, expected) => {
    expect(
      purchaseCost({ total: 1, usefulLiters: liters, vehiclePriceCents: 0, unitPriceCents: cents })
        .costPerLiterCents,
    ).toBe(expected);
  });

  it("un prix de format inconnu rend l'équipement, le total et le litre inconnus — jamais 0", () => {
    expect(
      purchaseCost({
        total: 6,
        usefulLiters: 180,
        vehiclePriceCents: 1_000_000,
        unitPriceCents: null,
      }),
    ).toEqual({ equipmentCostCents: null, totalCostCents: null, costPerLiterCents: null });
  });

  it("un véhicule sans prix garde son coût d'équipement, sans total ni litre", () => {
    expect(
      purchaseCost({ total: 6, usefulLiters: 180, vehiclePriceCents: null, unitPriceCents: 1_290 }),
    ).toEqual({ equipmentCostCents: 7_740, totalCostCents: null, costPerLiterCents: null });
  });

  it("zéro litre : le coût total existe, le coût par litre non", () => {
    expect(
      purchaseCost({
        total: 0,
        usefulLiters: 0,
        vehiclePriceCents: 1_000_000,
        unitPriceCents: 500,
      }),
    ).toEqual({ equipmentCostCents: 0, totalCostCents: 1_000_000, costPerLiterCents: null });
  });

  it("reste exact aux bornes : 2·10⁷ bacs à 1 M€ plus un véhicule à 1 M€", () => {
    // 2e7 × 1e8 + 1e8 = 2 000 000 100 000 000, divisible par 7.
    const cost = purchaseCost({
      total: 20_000_000,
      usefulLiters: 7,
      vehiclePriceCents: 100_000_000,
      unitPriceCents: 100_000_000,
    });
    expect(cost.totalCostCents).toBe(2_000_000_100_000_000);
    expect(cost.costPerLiterCents).toBe(285_714_300_000_000);
  });

  it("dit un bogue plutôt qu'un chiffre faux hors des entiers exacts", () => {
    expect(() =>
      purchaseCost({
        total: 2,
        usefulLiters: 1,
        vehiclePriceCents: 0,
        unitPriceCents: Number.MAX_SAFE_INTEGER,
      }),
    ).toThrow(PurchaseCostOverflowError);
  });
});
