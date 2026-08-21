import {
  createCategoryPayloadSchema,
  createEmplacementPayloadSchema,
  tvaRatePayloadSchema,
} from "../index.js";

describe("pim-contracts payload schemas", () => {
  it("accepte une création de catégorie minimale et refuse un nom vide", () => {
    expect(createCategoryPayloadSchema.safeParse({ nameFr: "Pains" }).success).toBe(true);
    expect(createCategoryPayloadSchema.safeParse({ nameFr: "" }).success).toBe(false);
  });

  it("refuse un taux de TVA non positif", () => {
    expect(tvaRatePayloadSchema.safeParse({ name: "Réduit", percent: 5.5 }).success).toBe(true);
    expect(tvaRatePayloadSchema.safeParse({ name: "Zéro", percent: 0 }).success).toBe(false);
  });

  it("borne le nombre de tables d’un emplacement", () => {
    const base = {
      name: "Village",
      clickCollect: true,
      surPlace: true,
      baseUrl: "",
    };
    expect(createEmplacementPayloadSchema.safeParse({ ...base, tableCount: 12 }).success).toBe(
      true,
    );
    expect(createEmplacementPayloadSchema.safeParse({ ...base, tableCount: 999 }).success).toBe(
      false,
    );
  });
});
