import { ProductCommerceOptions } from "../product-commerce-options.js";

describe("ProductCommerceOptions — les réglages de vente d'une fiche", () => {
  it("naît courante, sans froid, avec l'audience de sa famille", () => {
    expect(ProductCommerceOptions.initial()).toMatchObject({
      operationOnly: false,
      requiresCold: false,
      audience: null,
    });
  });

  it("rend le MÊME objet quand le réglage y était déjà — rien à écrire, rien à journaliser", () => {
    const options = ProductCommerceOptions.initial();
    expect(options.withOperationOnly(false)).toBe(options);
    expect(options.withRequiresCold(false)).toBe(options);
    expect(options.withAudience(null)).toBe(options);
  });

  it("change un réglage sans toucher aux autres, et sans muter l'original", () => {
    const options = ProductCommerceOptions.initial();
    const reserved = options.withOperationOnly(true).withRequiresCold(true);
    expect(reserved).toMatchObject({
      operationOnly: true,
      requiresCold: true,
    });
    expect(options.operationOnly).toBe(false);
  });

  it("une fiche née d'un détachement garde les réglages de son origine", () => {
    const origin = ProductCommerceOptions.of({
      operationOnly: true,
      requiresCold: true,
      audience: "pro",
    });
    expect(origin.forDetachedProduct(null)).toMatchObject({
      operationOnly: true,
      requiresCold: true,
      audience: "pro",
    });
  });

  it("une fiche née d'une déclinaison à audience propre prend cette audience", () => {
    const origin = ProductCommerceOptions.of({
      operationOnly: false,
      requiresCold: false,
      audience: "public",
    });
    expect(origin.forDetachedProduct("resupply").audience).toBe("resupply");
  });
});
