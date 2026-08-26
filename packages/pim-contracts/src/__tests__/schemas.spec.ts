import {
  createCategoryPayloadSchema,
  openPointOfSalePayloadSchema,
  vatRatePayloadSchema,
} from "../index.js";

describe("pim-contracts payload schemas", () => {
  it("accepte une création de catégorie minimale et refuse un nom vide", () => {
    // Le nom est LOCALISÉ depuis que les fiches parlent trois langues ; le test
    // interrogeait encore `nameFr`, donc un champ que le schéma ignore — il
    // échouait sur la branche « accepte », en annonçant un contrat disparu.
    expect(createCategoryPayloadSchema.safeParse({ name: { fr: "Pains" } }).success).toBe(true);
    expect(createCategoryPayloadSchema.safeParse({ name: { fr: "" } }).success).toBe(false);
  });

  it("refuse un taux de TVA non positif", () => {
    expect(vatRatePayloadSchema.safeParse({ name: "Réduit", percent: 5.5 }).success).toBe(true);
    expect(vatRatePayloadSchema.safeParse({ name: "Zéro", percent: 0 }).success).toBe(false);
  });

  it("borne le nombre de tables d’une boutique", () => {
    const base = {
      kind: "shop",
      label: "Village",
      baseUrl: "",
      contexts: ["takeaway"],
    };
    expect(openPointOfSalePayloadSchema.safeParse({ ...base, tableCount: 12 }).success).toBe(true);
    expect(openPointOfSalePayloadSchema.safeParse({ ...base, tableCount: 999 }).success).toBe(
      false,
    );
  });

  /**
   * Le **genre** est fermé : c'est une propriété de structure, pas une donnée.
   * Une valeur inventée doit être refusée au bord, sinon elle atteindrait un
   * `CHECK` de base et rendrait un 500 au lieu d'un refus.
   */
  it("refuse un genre de point de vente inconnu", () => {
    const base = { label: "Village", baseUrl: "", contexts: [], tableCount: 0 };
    expect(openPointOfSalePayloadSchema.safeParse({ ...base, kind: "platform" }).success).toBe(
      true,
    );
    expect(openPointOfSalePayloadSchema.safeParse({ ...base, kind: "borne" }).success).toBe(false);
  });
});
