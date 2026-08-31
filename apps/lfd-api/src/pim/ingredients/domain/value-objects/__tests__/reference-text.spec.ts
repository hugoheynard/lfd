import type { LocalizedText } from "@lfd/pim-contracts";

import {
  LocalizedNameRequiredError,
  ReferenceKeyInvalidError,
} from "../../errors/ingredient-errors.js";
import { cleanKey, cleanOptionalText, cleanRequiredText } from "../reference-text.js";

describe("cleanKey", () => {
  it.each([
    ["un seul segment", "cafe"],
    ["plusieurs segments", "cafe-arabica-bio"],
    ["des chiffres", "cafe123"],
  ])("accepte %s", (_label, raw) => {
    expect(cleanKey("ingrédient", raw)).toBe(raw);
  });

  it("nettoie les espaces autour d'une clé valide", () => {
    expect(cleanKey("ingrédient", "  cafe-arabica  ")).toBe("cafe-arabica");
  });

  it.each([
    ["une majuscule", "Cafe"],
    ["un accent", "café"],
    ["un underscore", "cafe_arabica"],
    ["un tiret en tête", "-cafe"],
    ["un tiret en fin", "cafe-"],
    ["deux tirets consécutifs", "cafe--arabica"],
    ["un espace au milieu", "cafe arabica"],
    ["une chaîne vide", ""],
    ["des espaces seuls", "   "],
  ])("refuse %s", (_label, raw) => {
    expect(() => cleanKey("ingrédient", raw)).toThrow(ReferenceKeyInvalidError);
  });

  // Le rejet doit citer la valeur BRUTE, pas la version nettoyée : sinon un
  // appelant qui a laissé traîner des espaces ne reconnaît pas ce qu'il a envoyé.
  it("cite la valeur brute, non nettoyée, dans l'erreur", () => {
    expect(() => cleanKey("ingrédient", "  Cafe Bio  ")).toThrow(
      new ReferenceKeyInvalidError("ingrédient", "  Cafe Bio  "),
    );
  });
});

describe("cleanOptionalText", () => {
  it("rend null pour une absence explicite", () => {
    expect(cleanOptionalText(null)).toBeNull();
  });

  it("rend null pour une absence implicite", () => {
    expect(cleanOptionalText(undefined)).toBeNull();
  });

  it("garde la seule langue source renseignée", () => {
    const text: LocalizedText = { fr: "café" };
    expect(cleanOptionalText(text)).toEqual({ fr: "café" });
  });

  it("nettoie les espaces de chaque locale renseignée", () => {
    const text: LocalizedText = { fr: " café ", en: " coffee " };
    expect(cleanOptionalText(text)).toEqual({ fr: "café", en: "coffee" });
  });

  it("garde plusieurs traductions quand elles sont toutes renseignées", () => {
    const text: LocalizedText = { fr: "café", en: "coffee", it: "caffè" };
    expect(cleanOptionalText(text)).toEqual({ fr: "café", en: "coffee", it: "caffè" });
  });

  it("retire une traduction réduite à des espaces", () => {
    const text: LocalizedText = { fr: "café", en: "   " };
    expect(cleanOptionalText(text)).toEqual({ fr: "café" });
  });

  // La langue source vidée entraîne la perte des traductions : un
  // `LocalizedText` sans `fr` n'existe pas dans le type.
  it("rend null, et perd les traductions, quand la langue source est réduite à des espaces", () => {
    const text: LocalizedText = { fr: "   ", en: "coffee" };
    expect(cleanOptionalText(text)).toBeNull();
  });

  it("est idempotente sur un texte déjà nettoyé", () => {
    const text: LocalizedText = { fr: "café", en: "coffee" };
    const once = cleanOptionalText(text);
    expect(cleanOptionalText(once)).toEqual(once);
  });
});

describe("cleanRequiredText", () => {
  it("rend le texte nettoyé quand la langue source est renseignée", () => {
    const text: LocalizedText = { fr: " café " };
    expect(cleanRequiredText("ingrédient", text)).toEqual({ fr: "café" });
  });

  it("refuse un texte dont la langue source est réduite à des espaces", () => {
    const text: LocalizedText = { fr: "   " };
    expect(() => cleanRequiredText("ingrédient", text)).toThrow(
      new LocalizedNameRequiredError("ingrédient"),
    );
  });
});
