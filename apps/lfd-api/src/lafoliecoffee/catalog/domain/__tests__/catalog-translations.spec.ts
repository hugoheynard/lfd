import { inLanguage, NO_TRANSLATIONS } from "../catalog-translations.js";

/** Le repli des langues de la vitrine (lot des langues, 2026-10-18). */
describe("inLanguage", () => {
  const TRANSLATED = { en: "Butter croissant" };

  it("sert la traduction quand le référentiel l'a écrite", () => {
    expect(inLanguage("Croissant", TRANSLATED, "en")).toBe("Butter croissant");
  });

  it("retombe sur le français quand la langue n'est pas traduite — jamais sur du vide", () => {
    expect(inLanguage("Croissant", TRANSLATED, "it")).toBe("Croissant");
    expect(inLanguage("Croissant", NO_TRANSLATIONS, "en")).toBe("Croissant");
  });

  it("sert le français en français, quoi que portent les traductions", () => {
    expect(inLanguage("Croissant", TRANSLATED, "fr")).toBe("Croissant");
  });

  it("laisse `null` une ligne qui n'existe pas, dans toutes les langues", () => {
    expect(inLanguage(null, TRANSLATED, "en")).toBeNull();
  });
});
