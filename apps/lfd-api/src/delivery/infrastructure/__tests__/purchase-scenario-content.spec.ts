import { purchaseScenarioContentOf, rawSelectionCountOf } from "../purchase-scenario-content.js";

const CONTENT = {
  selection: {
    vehicles: [{ source: "candidate", id: "vc1" }],
    formats: [{ source: "bin_type", id: "bt1" }],
    gapCm: 1,
  },
  display: null,
};

describe("purchaseScenarioContentOf (B-D5)", () => {
  it("relit un contenu valide tel quel", () => {
    expect(purchaseScenarioContentOf(CONTENT)).toEqual({ readable: true, content: CONTENT });
  });

  it("rend illisible, en nommant le chemin, un contenu qui ne passe plus la forme", () => {
    const stored = purchaseScenarioContentOf({
      ...CONTENT,
      selection: { ...CONTENT.selection, vehicles: [] },
    });

    expect(stored).toEqual({
      readable: false,
      reason: "selection.vehicles : au moins un véhicule",
    });
  });

  it("rend illisible un jeu que le domaine refuserait", () => {
    const stored = purchaseScenarioContentOf({
      ...CONTENT,
      selection: { ...CONTENT.selection, gapCm: 40 },
    });

    expect(stored.readable).toBe(false);
  });

  it("compte les éléments du contenu brut, zéro s'il n'a pas la forme", () => {
    expect(rawSelectionCountOf(CONTENT, "vehicles")).toBe(1);
    expect(rawSelectionCountOf({}, "formats")).toBe(0);
    expect(rawSelectionCountOf(null, "formats")).toBe(0);
  });
});
