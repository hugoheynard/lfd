import { translationsColumnOf } from "../catalog-translations-column.js";

/** Une colonne `*_translations` relue (lot des langues, 2026-10-18). */
describe("translationsColumnOf", () => {
  it("rend les langues traduites de la boutique", () => {
    expect(translationsColumnOf({ en: "Pastries", it: "Viennoiserie" })).toEqual({
      en: "Pastries",
      it: "Viennoiserie",
    });
  });

  /** Ligne d'avant le lot, ou fait d'avant lui : le rayon se nomme en français. */
  it("lit « rien de traduit » une colonne NULL", () => {
    expect(translationsColumnOf(null)).toEqual({});
  });

  it("ignore une langue inconnue, le français, une valeur vide ou hors forme", () => {
    expect(translationsColumnOf({ de: "Gebäck", fr: "Viennoiseries", en: "", it: 3 })).toEqual({});
    expect(translationsColumnOf(["en"])).toEqual({});
    expect(translationsColumnOf("Pastries")).toEqual({});
  });
});
