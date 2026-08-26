import {
  createCategoryPayloadSchema,
  createLocationPayloadSchema,
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

  it("borne le nombre de tables d’un emplacement", () => {
    const base = {
      name: "Village",
      clickCollect: true,
      eatIn: true,
      baseUrl: "",
    };
    expect(createLocationPayloadSchema.safeParse({ ...base, tableCount: 12 }).success).toBe(true);
    expect(createLocationPayloadSchema.safeParse({ ...base, tableCount: 999 }).success).toBe(false);
  });
});
