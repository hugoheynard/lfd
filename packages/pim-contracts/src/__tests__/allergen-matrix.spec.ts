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

describe("ALLERGEN_MATRIX_WORDING — les mots réglementaires (Hugo, 2026-10-20)", () => {
  it("titre = titre de l'annexe II d'INCO 1169/2011, verbatim, dans les trois langues", () => {
    expect(ALLERGEN_MATRIX_WORDING.fr.title).toBe(
      "Substances ou produits provoquant des allergies ou intolérances",
    );
    expect(ALLERGEN_MATRIX_WORDING.en.title).toBe(
      "Substances or products causing allergies or intolerances",
    );
    expect(ALLERGEN_MATRIX_WORDING.it.title).toBe(
      "Sostanze o prodotti che provocano allergie o intolleranze",
    );
  });

  it("présence = le mot de l'art. 21 ; traces = la formule d'usage validée", () => {
    expect(LOCALES.map((l) => ALLERGEN_MATRIX_WORDING[l].presence)).toEqual([
      { contains: "contient", traces: "Peut contenir des traces" },
      { contains: "contains", traces: "May contain traces" },
      { contains: "contiene", traces: "Può contenere tracce" },
    ]);
  });

  it("le document a ses douze mois et ses repères dans chaque langue", () => {
    for (const locale of LOCALES) {
      const document = ALLERGEN_MATRIX_WORDING[locale].document;
      expect(document.months).toHaveLength(12);
      expect(document.footer).toContain("{date}");
      expect(document.generatedAt).toContain("{date}");
      expect(document.page).toContain("{page}");
      expect(document.page).toContain("{count}");
      expect(document.family).toContain("{name}");
    }
  });
});
