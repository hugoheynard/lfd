import {
  PromotionDescriptionNotCanonicalError,
  PromotionDescriptionTooLongError,
} from "../errors/promotion-description-errors.js";
import { Promotion } from "../promotion.js";
import { revisionActOf } from "../promotion-act.js";
import {
  PROMOTION_DESCRIPTION_MAX_LENGTH,
  promotionDescriptionOf,
} from "../promotion-description.js";
import { FROM, lineTerms } from "./promotion-terms.fixture.js";

const posed = (description: string | null) =>
  Promotion.pose("promo_1", lineTerms({ description }), "staff", FROM);

describe("la description interne d'une promotion", () => {
  it("est facultative : absente, vide ou blanche, elle vaut null", () => {
    expect(promotionDescriptionOf(null)).toBeNull();
    expect(promotionDescriptionOf("")).toBeNull();
    expect(promotionDescriptionOf("  \n ")).toBeNull();
  });

  it("perd ses espaces de bord et garde ceux du milieu", () => {
    expect(promotionDescriptionOf("  Pour le fournil,\nle mardi  ")).toBe(
      "Pour le fournil,\nle mardi",
    );
  });

  it("est bornée : la borne passe, un caractère de plus est refusé", () => {
    const max = "a".repeat(PROMOTION_DESCRIPTION_MAX_LENGTH);
    expect(promotionDescriptionOf(` ${max} `)).toBe(max);
    expect(() => promotionDescriptionOf(`${max}a`)).toThrow(PromotionDescriptionTooLongError);
  });

  it("l'agrégat refuse une description non canonique ou trop longue", () => {
    expect(() => posed(" x")).toThrow(PromotionDescriptionNotCanonicalError);
    expect(() => posed("")).toThrow(PromotionDescriptionNotCanonicalError);
    expect(() => posed("a".repeat(PROMOTION_DESCRIPTION_MAX_LENGTH + 1))).toThrow(
      PromotionDescriptionTooLongError,
    );
    expect(posed("Pour le fournil").terms.description).toBe("Pour le fournil");
  });

  it("une description changée est une révision : la promotion ne la dit pas déjà", () => {
    const promotion = posed(null);
    expect(promotion.saysAlready(lineTerms({ description: "Nouvelle" }))).toBe(false);
    expect(promotion.revise(lineTerms({ description: "Nouvelle" })).terms.description).toBe(
      "Nouvelle",
    );
  });

  it("le journal dit « description modifiée » quand c'est le seul changement", () => {
    const before = posed(null);
    const revised = before.revise(lineTerms({ description: "Nouvelle" }));
    const act = revisionActOf(before.terms, revised, "staff", FROM, null);
    expect(act.summary).toMatch(/ · description modifiée$/);
    expect(act.summary).not.toContain("Nouvelle");
  });

  it("le journal ne le dit pas quand autre chose change aussi", () => {
    const before = posed(null);
    const revised = before.revise(lineTerms({ description: "Nouvelle", cumulative: true }));
    expect(revisionActOf(before.terms, revised, "staff", FROM, null).summary).not.toContain(
      "description",
    );
  });
});
