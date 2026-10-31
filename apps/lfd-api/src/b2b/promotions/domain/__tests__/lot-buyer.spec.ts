import { TypicalBuyer } from "../lot-buyer.js";
import { livePromotion } from "./live-promotion.fixture.js";
import { promotionsAdmitted } from "../live-promotion.js";
import { TYPICAL_BUYER, type PromotionAudienceFacts } from "../promotion-targeting.js";

/**
 * **Le pro type** (`plan-export-grille-de-prix.md`, § 8) — un objet opaque,
 * dont les faits sont ceux de l'acheteur type de l'annonce d'un point.
 * Dates comparées entre elles seulement.
 */

const AT = new Date("2030-01-15T09:00:00.000Z");

function admittedIds(facts: PromotionAudienceFacts): readonly string[] {
  const promotions = [
    livePromotion({ id: "tous" }),
    livePromotion({ id: "pros", audience: { kind: "pros" } }),
    livePromotion({ id: "actifs", audience: { kind: "pros_active" } }),
    livePromotion({ id: "en_attente", audience: { kind: "pros_pending" } }),
    livePromotion({ id: "particuliers", audience: { kind: "individuals" } }),
    livePromotion({ id: "sauf_actifs", audience: { kind: "everyone_but_active_pros" } }),
    livePromotion({ id: "societe", audience: { kind: "company", companyId: "co_1" } }),
    livePromotion({ id: "groupe", audience: { kind: "company_and_sites", companyId: "co_1" } }),
  ];
  return promotionsAdmitted(promotions, AT, facts, null)
    .map((promotion) => promotion.id)
    .sort();
}

describe("TypicalBuyer", () => {
  it("reprend les faits de l'acheteur type de l'annonce — une seule définition", () => {
    expect(TypicalBuyer.of("pro_active").facts).toBe(TYPICAL_BUYER.b2b);
    expect(TypicalBuyer.of("pro_pending").facts).toBe(TYPICAL_BUYER.b2bPending);
    expect(TypicalBuyer.of("pro_active")).toMatchObject({
      kind: "typical",
      clientele: "pro_active",
    });
  });

  it("n'est aucune société : sans identité, porte d'entrée inconnue", () => {
    expect(TypicalBuyer.of("pro_active").facts).toMatchObject({
      companyId: null,
      companyStatus: "active",
      buyerKind: "unknown",
    });
  });

  it("un pro actif : « pros actifs » admise, « particuliers » non, une société jamais", () => {
    const facts = { ...TypicalBuyer.of("pro_active").facts, fulfillment: null };

    expect(admittedIds(facts)).toEqual(["actifs", "pros", "tous"]);
  });

  it("un pro en cours d'inscription : « pros en attente », et « sauf pros actifs »", () => {
    const facts = { ...TypicalBuyer.of("pro_pending").facts, fulfillment: null };

    expect(admittedIds(facts)).toEqual(["en_attente", "pros", "sauf_actifs", "tous"]);
  });
});
