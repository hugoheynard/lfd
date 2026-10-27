import {
  applyIngredientAllergenPropagationPayloadSchema,
  ingredientAllergenPropagationQuerySchema,
} from "../index.js";

describe("propagation des allergènes d'un ingrédient — forme", () => {
  it("lit des listes de codes séparées par des virgules, absentes = vides", () => {
    expect(ingredientAllergenPropagationQuerySchema.parse({ added: "GB, UW,," })).toEqual({
      added: ["GB", "UW"],
      removed: [],
    });
  });

  it("accepte une application sans case décochée", () => {
    const parsed = applyIngredientAllergenPropagationPayloadSchema.safeParse({
      added: ["GB"],
      removed: [],
    });

    expect(parsed.success).toBe(true);
  });

  it("refuse un code vide", () => {
    const parsed = applyIngredientAllergenPropagationPayloadSchema.safeParse({
      added: [" "],
      removed: [],
    });

    expect(parsed.success).toBe(false);
  });
});
