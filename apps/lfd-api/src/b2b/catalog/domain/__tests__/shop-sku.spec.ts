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
  it("« fiche — déclinaison » pour une déclinaison non défaut", () => {
    expect(shopItemName("Boîte de 220 g", "Florentin", false)).toBe("Florentin — Boîte de 220 g");
  });

  it("le défaut garde son nom d'aujourd'hui", () => {
    expect(shopItemName("Croissant", "Croissant pur beurre", true)).toBe("Croissant");
  });

  /**
   * `product_name` reste `NULL` en production jusqu'à la réémission de chaque
   * fiche (fil v16) : jamais « null — 220 g », le nom de la déclinaison seul.
   */
  it("sans nom de fiche reçu, sert le nom de la déclinaison seul", () => {
    expect(shopItemName("Boîte de 220 g", null, false)).toBe("Boîte de 220 g");
    expect(shopItemName("Boîte de 220 g", "  ", false)).toBe("Boîte de 220 g");
  });

  it("ne double pas un nom de déclinaison déjà égal à celui de la fiche", () => {
    expect(shopItemName("Florentin", "Florentin", false)).toBe("Florentin");
  });
});
