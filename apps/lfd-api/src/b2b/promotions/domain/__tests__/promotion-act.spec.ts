import { Promotion } from "../promotion.js";
import { describePromotion, promotionActOf } from "../promotion-act.js";
import { FROM, UNTIL, basketTerms, lineTerms } from "./promotion-terms.fixture.js";

describe("la phrase figée d'une promotion", () => {
  it("dit l'effet, le public, l'acheminement et la fenêtre", () => {
    expect(describePromotion(lineTerms())).toBe(
      "−20 % · tout le monde · tous acheminements · du 1er novembre 2026, sans date de fin",
    );
    expect(
      describePromotion(
        basketTerms({ effect: { kind: "basket_amount_off", cents: 550 }, validTo: UNTIL }),
      ),
    ).toBe(
      "−5,50 € sur le panier · tous sauf les pros actifs · retrait au point pk_coeur · du 1er novembre 2026 au 1er décembre 2026",
    );
  });

  it("nomme la société visée et le prix posé", () => {
    const terms = lineTerms({
      effect: { kind: "fixed_unit_price", millicents: 120_000 },
      audience: { kind: "company", companyId: "co_1" },
    });
    expect(describePromotion(terms)).toContain("prix posé 1,20 € · une société (co_1)");
  });

  it("l'acte porte le sujet, l'auteur, l'instant et le nom interne", () => {
    const promotion = Promotion.pose("promo_1", lineTerms(), "staff_1", FROM);
    expect(promotionActOf(promotion, "posed", "staff_1", FROM, null)).toEqual({
      subjectId: "promo_1",
      kind: "posed",
      actor: "staff_1",
      at: FROM,
      reason: null,
      summary: describePromotion(lineTerms()),
      subjectLabel: "Promo d'automne",
    });
  });
});
