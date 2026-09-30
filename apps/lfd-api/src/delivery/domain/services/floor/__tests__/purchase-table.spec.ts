import { BinFormat } from "../../../value-objects/bin-format.js";
import { CargoFloor } from "../../../value-objects/cargo-floor.js";
import { crossPurchaseTable, type PurchaseTableFormat } from "../purchase-table.js";

const FLOOR = CargoFloor.of({ lengthCm: 100, widthCm: 100, heightCm: 50, wheelArches: null });

const formatOf = (
  outer: readonly [number, number, number],
  inner: readonly [number, number, number],
  maxStack: number,
  unitPriceCents: number | null,
): PurchaseTableFormat => ({
  format: BinFormat.of({
    outer: { lengthCm: outer[0], widthCm: outer[1], heightCm: outer[2] },
    inner: { lengthCm: inner[0], widthCm: inner[1], heightCm: inner[2] },
    maxStack,
  }),
  unitPriceCents,
});

// Grand : 3 au sol × 2 étages = 6 bacs de 30 L = 180 L, 36 % (cf. assistant).
const GRAND = formatOf([60, 40, 20], [50, 30, 20], 5, 1_290);
// Petit : 4 bacs de 50 L = 200 L, 40 %, prix inconnu.
const PETIT = formatOf([50, 50, 20], [50, 50, 20], 1, null);
// Géant : 150 × 150 n'entre pas dans 100 × 100 — 0 bac, 0 L.
const GEANT = formatOf([150, 150, 20], [150, 150, 20], 1, 500);

describe("crossPurchaseTable — tableau croisé (B-D4)", () => {
  it("calcule chaque case, ses coûts, et la meilleure case par critère", () => {
    const table = crossPurchaseTable(
      [
        { floor: FLOOR, priceCents: 1_000_000 },
        { floor: FLOOR, priceCents: null },
      ],
      [GRAND, PETIT, GEANT],
      0,
    );

    const [priced, unpriced] = table.rows;
    expect(priced?.cells).toEqual([
      expect.objectContaining({
        total: 6,
        usefulLiters: 180,
        vehiclePercent: 36,
        equipmentCostCents: 7_740,
        totalCostCents: 1_007_740,
        costPerLiterCents: 5_599,
      }),
      expect.objectContaining({
        total: 4,
        usefulLiters: 200,
        vehiclePercent: 40,
        equipmentCostCents: null,
        totalCostCents: null,
        costPerLiterCents: null,
      }),
      expect.objectContaining({
        total: 0,
        usefulLiters: 0,
        equipmentCostCents: 0,
        totalCostCents: 1_000_000,
        costPerLiterCents: null,
      }),
    ]);
    expect(priced?.best).toEqual({ occupation: 1, volume: 1, costPerLiter: 0 });
    expect(unpriced?.cells[0]).toMatchObject({
      equipmentCostCents: 7_740,
      totalCostCents: null,
      costPerLiterCents: null,
    });
    expect(unpriced?.best).toEqual({ occupation: 1, volume: 1, costPerLiter: null });
    expect(table.bestRowByCostPerLiter).toBe(0);
  });

  it("aucune case pleine, aucun prix : rien ne se classe", () => {
    const table = crossPurchaseTable([{ floor: FLOOR, priceCents: null }], [GEANT], 0);

    expect(table.rows[0]?.best).toEqual({ occupation: null, volume: null, costPerLiter: null });
    expect(table.bestRowByCostPerLiter).toBeNull();
  });

  it("la meilleure ligne est la moins chère au litre ; à égalité, la première", () => {
    const table = crossPurchaseTable(
      [
        { floor: FLOOR, priceCents: 2_000_000 },
        { floor: FLOOR, priceCents: 1_000_000 },
        { floor: FLOOR, priceCents: 1_000_000 },
      ],
      [GRAND],
      0,
    );

    expect(table.bestRowByCostPerLiter).toBe(1);
  });

  it("compte les bacs au-dessus des passages de roue, comme l'assistant", () => {
    // Passages de 20 cm de haut : k₀ = 1, un étage libre au-dessus pour les bacs latéraux.
    const arched = CargoFloor.of({
      lengthCm: 100,
      widthCm: 100,
      heightCm: 50,
      wheelArches: { lengthCm: 100, protrusionCm: 20, fromBackCm: 0, heightCm: 20 },
    });
    const small = formatOf([20, 20, 20], [20, 20, 20], 2, null);

    const [row] = crossPurchaseTable([{ floor: arched, priceCents: null }], [small], 0).rows;

    // Au sol : 5 rangées × ⌊60 ÷ 20⌋ = 15 ; plein : 5 ; 2 étages → 15 × 2 + 5 × 2 × (2 − 1) = 40.
    expect(row?.cells[0]).toMatchObject({ floorCount: 15, levels: 2, total: 40 });
  });
});
