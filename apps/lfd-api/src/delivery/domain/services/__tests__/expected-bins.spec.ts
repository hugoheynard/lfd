import { expectedBinCount } from "../expected-bins.js";
import type { PackedBins, PackingProposal } from "../propose-packing.js";

function packed(whole: number, half: boolean): PackedBins {
  return {
    binTypeId: "bin_m",
    cold: false,
    whole,
    half,
    lastFill: 1,
    lastContent: [],
    content: [],
  };
}

describe("expectedBinCount — combien de bacs la proposition prévoit (PL4)", () => {
  it("compte chaque bac entier, et une moitié pour un", () => {
    const proposal: PackingProposal = {
      bins: [packed(2, true), packed(1, false)],
      unplaced: [],
    };
    expect(expectedBinCount(proposal)).toBe(4);
  });

  it("rien à placer : zéro bac", () => {
    expect(expectedBinCount({ bins: [], unplaced: [] })).toBe(0);
  });

  it("une ligne non placée : la proposition ne sait pas dire, `null` — jamais un compte partiel", () => {
    const proposal: PackingProposal = {
      bins: [packed(3, false)],
      unplaced: [{ sku: "PAI-009", quantity: 1, reason: "no_capacity" }],
    };
    expect(expectedBinCount(proposal)).toBeNull();
  });
});
