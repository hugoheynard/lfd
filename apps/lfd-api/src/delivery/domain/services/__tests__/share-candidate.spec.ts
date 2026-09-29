import { capacityGrid } from "../pack-group.js";
import type { PackedBins } from "../propose-packing.js";
import { type FreeHalf, pickShareCandidate } from "../share-candidate.js";

const GRID = capacityGrid([
  { binTypeId: "bin_m", sku: "CROISSANT", units: 24 },
  { binTypeId: "bin_s", sku: "TARTE", units: 4 },
]);
const ISOTHERM = new Set(["bin_s"]);
const isothermOf = (binTypeId: string): boolean => ISOTHERM.has(binTypeId);

function entry(binTypeId: string, lastQuantity: number, sku = "CROISSANT"): PackedBins {
  return {
    binTypeId,
    cold: ISOTHERM.has(binTypeId),
    whole: 1,
    half: false,
    lastFill: 1,
    lastContent: [{ sku, quantity: lastQuantity }],
    content: [{ sku, quantity: lastQuantity }],
  };
}

function half(binId: string, position: number, binTypeId = "bin_m"): FreeHalf {
  return { binId, orderId: `ord_${binId}`, position, binTypeId, isotherm: isothermOf(binTypeId) };
}

describe("le demi-bac partagé, en dernier recours (v2-4)", () => {
  it("propose la moitié voisine quand le reste tient dans 0,5 de son type", () => {
    const choice = pickShareCandidate([entry("bin_m", 12)], isothermOf, [half("b1", 2)], GRID);

    expect(choice).toEqual({ half: half("b1", 2), replacesBinIndex: 0 });
  });

  it("refuse un reste qui dépasse la moitié", () => {
    expect(pickShareCandidate([entry("bin_m", 13)], isothermOf, [half("b1", 2)], GRID)).toBeNull();
  });

  it("refuse une moitié d'un autre genre : pas de sec dans l'isotherme, ni l'inverse", () => {
    expect(
      pickShareCandidate([entry("bin_m", 2)], isothermOf, [half("b1", 2, "bin_s")], GRID),
    ).toBeNull();
    expect(
      pickShareCandidate([entry("bin_s", 1, "TARTE")], isothermOf, [half("b1", 2)], GRID),
    ).toBeNull();
  });

  it("refuse un type qui ne contient pas le produit du reste", () => {
    const grid = capacityGrid([{ binTypeId: "bin_m", sku: "BAGUETTE", units: 12 }]);

    expect(pickShareCandidate([entry("bin_m", 2)], isothermOf, [half("b1", 2)], grid)).toBeNull();
  });

  it("sans moitié libre : rien", () => {
    expect(pickShareCandidate([entry("bin_m", 2)], isothermOf, [], GRID)).toBeNull();
  });

  it("choisit par position d'arrêt, puis par identifiant — le même choix à chaque lecture", () => {
    const choice = pickShareCandidate(
      [entry("bin_m", 2)],
      isothermOf,
      [half("b9", 4), half("b2", 2), half("b1", 2)],
      GRID,
    );

    expect(choice?.half.binId).toBe("b1");
  });
});
