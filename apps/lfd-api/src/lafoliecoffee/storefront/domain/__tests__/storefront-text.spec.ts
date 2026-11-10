import { InvalidStorefrontError } from "../storefront-errors.js";
import { STOREFRONT_TEXT_FIELDS, StorefrontText } from "../storefront-text.js";

const TITLE = STOREFRONT_TEXT_FIELDS.title;

describe("StorefrontText", () => {
  it("exige le français, et le dit", () => {
    expect(() => StorefrontText.of({ fr: "   ", en: "Easter" }, TITLE)).toThrow(
      new InvalidStorefrontError("text", "Le titre d'une info porte un texte en français."),
    );
  });

  it("garde l'anglais et l'italien facultatifs, et retire une traduction vide", () => {
    const text = StorefrontText.of({ fr: " Pâques ", en: "", it: "Pasqua" }, TITLE);
    expect(text.toPersistence()).toEqual({ fr: "Pâques", it: "Pasqua" });
  });

  it("borne la longueur dans CHAQUE langue", () => {
    const long = "x".repeat(TITLE.max + 1);
    expect(() => StorefrontText.of({ fr: "Pâques", en: long }, TITLE)).toThrow(
      /tient en 80 caractères, dans chaque langue/u,
    );
    expect(() => StorefrontText.of({ fr: "x".repeat(TITLE.max) }, TITLE)).not.toThrow();
  });
});
