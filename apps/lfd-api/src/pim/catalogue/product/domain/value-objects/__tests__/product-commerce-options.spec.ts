import { ProductCommerceOptions } from "../product-commerce-options.js";

describe("ProductCommerceOptions — les réglages de vente d'une fiche", () => {
  it("naît courante, sans froid, avec l'audience de sa famille, vignettes montrées", () => {
    expect(ProductCommerceOptions.initial()).toMatchObject({
      operationOnly: false,
      requiresCold: false,
      audience: null,
      variantsAsTiles: true,
    });
  });

  it("rend le MÊME objet quand le réglage y était déjà — rien à écrire, rien à journaliser", () => {
    const options = ProductCommerceOptions.initial();
    expect(options.withOperationOnly(false)).toBe(options);
    expect(options.withRequiresCold(false)).toBe(options);
    expect(options.withAudience(null)).toBe(options);
    expect(options.withVariantsAsTiles(true)).toBe(options);
  });

  it("change un réglage sans toucher aux autres, et sans muter l'original", () => {
    const options = ProductCommerceOptions.initial();
    const reserved = options.withOperationOnly(true).withRequiresCold(true);
    expect(reserved).toMatchObject({
      operationOnly: true,
      requiresCold: true,
      variantsAsTiles: true,
    });
    expect(options.operationOnly).toBe(false);
  });

  it("une fiche née d'un détachement montre ses vignettes et garde le reste", () => {
    const origin = ProductCommerceOptions.of({
      operationOnly: true,
      requiresCold: true,
      audience: "pro",
      variantsAsTiles: false,
    });
    expect(origin.forDetachedProduct(null)).toMatchObject({
      operationOnly: true,
      requiresCold: true,
      audience: "pro",
      variantsAsTiles: true,
    });
  });

  it("une fiche née d'une déclinaison à audience propre prend cette audience", () => {
    const origin = ProductCommerceOptions.of({
      operationOnly: false,
      requiresCold: false,
      audience: "public",
      variantsAsTiles: true,
    });
    expect(origin.forDetachedProduct("resupply").audience).toBe("resupply");
  });
});
