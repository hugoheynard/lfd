import { DEFAULT_TONE, STOREFRONT_TONES, toneApplies } from "../tone.js";

const product = { kind: "product" } as const;
const info = { kind: "info" } as const;

describe("les tons", () => {
  it("sont trois, et le défaut est `light`", () => {
    expect(STOREFRONT_TONES).toEqual(["light", "dark", "accent"]);
    expect(DEFAULT_TONE).toBe("light");
  });
});

describe("toneApplies", () => {
  it("ne s'applique pas à un produit rendu en carte 1×1 — la grille reste homogène", () => {
    expect(toneApplies("card", [product])).toBe(false);
    expect(toneApplies("card", [product, product])).toBe(false);
  });

  it("s'applique à une carte qui porte une info, seule ou parmi des produits", () => {
    expect(toneApplies("card", [info])).toBe(true);
    expect(toneApplies("card", [product, info])).toBe(true);
  });

  it("s'applique à une carte encore vide : elle n'est pas un produit", () => {
    expect(toneApplies("card", [])).toBe(true);
  });

  it("s'applique à un produit sur toute autre forme", () => {
    for (const shape of ["kakemono", "tile", "block", "hero", "band", "doubleBand"] as const) {
      expect(toneApplies(shape, [product])).toBe(true);
    }
  });
});
