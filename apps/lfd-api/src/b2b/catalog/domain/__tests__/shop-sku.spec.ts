import { isShownAsTile, shopItemName, shopSkuOf } from "../shop-sku.js";

/** Le SKU de vente et le nom d'une vignette (`plan-declinaisons-en-vignette.md`, V4, V5). */
describe("shopSkuOf", () => {
  it("la déclinaison par défaut se vend sous le SKU produit — celui des commandes passées", () => {
    expect(shopSkuOf({ sku: "VIE-001-1", productSku: "VIE-001", isDefault: true })).toBe("VIE-001");
  });

  it("une autre déclinaison se vend sous son propre SKU", () => {
    expect(shopSkuOf({ sku: "VIE-001-2", productSku: "VIE-001", isDefault: false })).toBe(
      "VIE-001-2",
    );
  });
});

describe("isShownAsTile", () => {
  it("le défaut paraît toujours, l'option décochée comprise", () => {
    expect(isShownAsTile({ isDefault: true, variantsAsTiles: false })).toBe(true);
  });

  it("une autre déclinaison ne paraît que si la fiche montre chaque déclinaison", () => {
    expect(isShownAsTile({ isDefault: false, variantsAsTiles: true })).toBe(true);
    expect(isShownAsTile({ isDefault: false, variantsAsTiles: false })).toBe(false);
  });
});

describe("shopItemName", () => {
  /** Régression : « Ancolie framboise — Ancolie framboise part » au rayon (2026-10-29). */
  it("sert le nom de la déclinaison seul, sans celui de la fiche devant", () => {
    expect(shopItemName("Ancolie framboise part")).toBe("Ancolie framboise part");
  });
});
