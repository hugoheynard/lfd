import { catalogTranslationsSchema, translationsOf } from "../translations.js";

/**
 * Les traductions d'un texte du référentiel, telles qu'un fait du catalogue
 * les porte (lot des langues, 2026-10-18).
 */
describe("translationsOf", () => {
  it("garde les langues traduites et laisse le français à son champ", () => {
    expect(translationsOf({ fr: "Croissant", en: "Croissant", it: "Cornetto" })).toEqual({
      en: "Croissant",
      it: "Cornetto",
    });
  });

  it("n'invente aucune langue absente", () => {
    expect(translationsOf({ fr: "Croissant" })).toEqual({});
  });

  it("rend un objet vide pour un texte qui n'existe pas", () => {
    expect(translationsOf(null)).toEqual({});
  });
});

describe("catalogTranslationsSchema", () => {
  /** Un fait émis avant le lot : on ne sait pas, ce qui n'est pas « rien de traduit ». */
  it("lit `null` une traduction absente du fil", () => {
    expect(catalogTranslationsSchema.parse(undefined)).toBeNull();
  });

  it("refuse une langue que le référentiel ne connaît pas", () => {
    expect(catalogTranslationsSchema.safeParse({ de: "Hörnchen" }).success).toBe(false);
  });

  it("refuse le français, qui voyage à côté", () => {
    expect(catalogTranslationsSchema.safeParse({ fr: "Croissant" }).success).toBe(false);
  });

  it("refuse une traduction vide, qui dirait « effacé »", () => {
    expect(catalogTranslationsSchema.safeParse({ en: "" }).success).toBe(false);
  });
});
