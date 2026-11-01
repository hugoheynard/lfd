import {
  PromotionTileTextNotCanonicalError,
  PromotionTileTextTooLongError,
  PromotionTileTextWithoutFrenchError,
} from "../errors/promotion-tile-text-errors.js";
import { Promotion } from "../promotion.js";
import {
  PROMOTION_TILE_TEXT_MAX_LENGTH,
  promotionTileTextOf,
  tileTextIn,
} from "../promotion-tile-text.js";
import { FROM, lineTerms } from "./promotion-terms.fixture.js";

const posed = (tileText: { fr: string; en: string | null; it: string | null } | null) =>
  Promotion.pose("promo_1", lineTerms({ tileText }), "staff", FROM);

describe("le texte d'une promotion sur les vignettes", () => {
  it("est facultatif : absent, ou sans français ni traduction, il vaut null", () => {
    expect(promotionTileTextOf(null)).toBeNull();
    expect(promotionTileTextOf({ fr: "  ", en: null, it: "" })).toBeNull();
  });

  it("perd ses espaces de bord, et une traduction vide vaut null", () => {
    expect(promotionTileTextOf({ fr: " −20 % Folie Coffee ", en: "  ", it: " −20% " })).toEqual({
      fr: "−20 % Folie Coffee",
      en: null,
      it: "−20%",
    });
  });

  it("refuse une traduction sans français", () => {
    expect(() => promotionTileTextOf({ fr: " ", en: "−20%", it: null })).toThrow(
      PromotionTileTextWithoutFrenchError,
    );
  });

  it("est borné dans chaque langue : la borne passe, un caractère de plus est refusé", () => {
    const max = "a".repeat(PROMOTION_TILE_TEXT_MAX_LENGTH);
    expect(promotionTileTextOf({ fr: max, en: null, it: null })?.fr).toBe(max);
    expect(() => promotionTileTextOf({ fr: "ok", en: `${max}a`, it: null })).toThrow(
      PromotionTileTextTooLongError,
    );
  });

  it("l'agrégat refuse un texte non canonique ou trop long", () => {
    expect(() => posed({ fr: " x", en: null, it: null })).toThrow(
      PromotionTileTextNotCanonicalError,
    );
    expect(() => posed({ fr: "x", en: "", it: null })).toThrow(PromotionTileTextNotCanonicalError);
    expect(() =>
      posed({ fr: "a".repeat(PROMOTION_TILE_TEXT_MAX_LENGTH + 1), en: null, it: null }),
    ).toThrow(PromotionTileTextTooLongError);
    expect(posed({ fr: "−20 %", en: null, it: null }).terms.tileText?.fr).toBe("−20 %");
  });

  it("un texte changé est une révision : la promotion ne le dit pas déjà", () => {
    const text = { fr: "−20 % Folie Coffee", en: null, it: null };
    expect(posed(null).saysAlready(lineTerms({ tileText: text }))).toBe(false);
    expect(posed(null).revise(lineTerms({ tileText: text })).terms.tileText).toEqual(text);
  });

  it("se lit dans une langue, repli sur le français ; null = la valeur seule", () => {
    const text = { fr: "−20 % Folie Coffee", en: "−20% Folie Coffee", it: null };
    expect(tileTextIn(text, "en")).toBe("−20% Folie Coffee");
    expect(tileTextIn(text, "it")).toBe("−20 % Folie Coffee");
    expect(tileTextIn(null, "fr")).toBeNull();
  });
});
