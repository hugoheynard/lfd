import {
  catalogTranslationsSchema,
  translationsOf,
  variantNameTranslationsOf,
} from "../translations.js";

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

/** Régression 2026-10-18 : les noms traduits sur la fiche ne descendaient pas. */
describe("variantNameTranslationsOf", () => {
  it("prend la traduction de la fiche pour une déclinaison au même nom, non traduite", () => {
    expect(
      variantNameTranslationsOf(
        { fr: "Roulé à la cannelle" },
        { fr: "Roulé à la cannelle", en: "Cinnamon rolls" },
      ),
    ).toEqual({ en: "Cinnamon rolls" });
  });

  it("ne colle rien de la fiche sur une déclinaison au nom différent", () => {
    expect(
      variantNameTranslationsOf(
        { fr: "Pain aux olives 2 kg" },
        { fr: "Pain aux olives", en: "Olive bread" },
      ),
    ).toEqual({});
  });

  it("préfère la traduction de la déclinaison, langue par langue", () => {
    expect(
      variantNameTranslationsOf(
        { fr: "Croissant", en: "Butter croissant" },
        { fr: "Croissant", en: "Croissant", it: "Cornetto" },
      ),
    ).toEqual({ en: "Butter croissant", it: "Cornetto" });
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
