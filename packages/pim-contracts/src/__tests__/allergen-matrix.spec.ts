import { ALLERGEN_MATRIX_WORDING, LOCALES, allergenMatrixQuerySchema } from "../index.js";

describe("allergenMatrixQuerySchema", () => {
  it("pose les défauts : français, publiés, non renseignés inclus", () => {
    expect(allergenMatrixQuerySchema.parse({})).toEqual({
      locale: "fr",
      scope: "published",
      includeUndeclared: true,
    });
  });

  it("lit l'italien, tous les produits, une famille et l'exclusion des non renseignés", () => {
    expect(
      allergenMatrixQuerySchema.parse({
        locale: "it",
        scope: "all",
        categoryId: "cat_1",
        includeUndeclared: "false",
      }),
    ).toEqual({ locale: "it", scope: "all", categoryId: "cat_1", includeUndeclared: false });
  });

  it("refuse une langue et un périmètre inconnus", () => {
    expect(allergenMatrixQuerySchema.safeParse({ locale: "de" }).success).toBe(false);
    expect(allergenMatrixQuerySchema.safeParse({ scope: "archived" }).success).toBe(false);
  });
});

describe("ALLERGEN_MATRIX_WORDING", () => {
  it("a chaque mot dans chaque langue, et l'état « déclaré » reste muet", () => {
    for (const locale of LOCALES) {
      const wording = ALLERGEN_MATRIX_WORDING[locale];
      for (const word of [
        ...Object.values(wording.headers),
        wording.presence.contains,
        wording.presence.traces,
        wording.states.not_declared,
        wording.states.none_declared,
        wording.states.to_review,
      ]) {
        expect(word.trim()).not.toBe("");
      }
      expect(wording.states.declared).toBe("");
    }
  });
});
