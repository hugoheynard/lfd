import { UnreadablePromotionRowError } from "../../domain/errors/promotion-errors.js";
import { Promotion } from "../../domain/promotion.js";
import { FROM, basketTerms, lineTerms } from "../../domain/__tests__/promotion-terms.fixture.js";
import { scopeRuleRowsOf, toDomain, toPersistence, type PromotionRow } from "../promotion-rows.js";

function rowOf(promotion: Promotion): PromotionRow {
  return { ...toPersistence(promotion), origin: null };
}

const SCOPED = lineTerms({
  scope: {
    mode: "only",
    rules: [
      { target: "category", targetId: "c_1", eligible: true, targetRank: null },
      { target: "variant", targetId: "SKU-1", eligible: true, targetRank: 2 },
    ],
  },
  conditions: [{ kind: "min_quantity", value: 6 }],
  ownFloor: { mode: "percent", value: 5000 },
});

describe("les mappers de la promotion", () => {
  it.each([
    ["une promotion de ligne avec portée, condition et plancher", SCOPED],
    [
      "une promotion de panier sur un point",
      basketTerms({ effect: { kind: "basket_amount_off", cents: 300 } }),
    ],
    [
      "une société et ses sites",
      lineTerms({ audience: { kind: "company_and_sites", companyId: "co_1" } }),
    ],
  ])("aller-retour sans perte : %s", (_case, terms) => {
    const promotion = Promotion.pose("promo_1", terms, "staff_1", FROM)
      .pause("staff_1", FROM)
      .archive("staff_2", FROM, "fin");
    const back = toDomain(rowOf(promotion), scopeRuleRowsOf(promotion));
    expect(back.toPersistence()).toEqual(promotion.toPersistence());
  });

  it("compose l'identifiant d'une règle de portée comme la reprise", () => {
    const promotion = Promotion.pose("promo_1", SCOPED, "staff_1", FROM);
    expect(scopeRuleRowsOf(promotion).map((row) => row.id)).toEqual([
      "promo_1:category:c_1",
      "promo_1:variant:SKU-1",
    ]);
  });

  it("relit l'origine d'une reprise", () => {
    const promotion = Promotion.pose(
      "pd_site_b2c",
      basketTerms(),
      "system:reprise-promotions",
      FROM,
    );
    const origin = { kind: "pickup_discount", siteId: "site", clientele: "b2c" };
    expect(toDomain({ ...rowOf(promotion), origin }, []).toPersistence().origin).toEqual(origin);
  });

  it.each([
    ["un effet inconnu", { effectKind: "buy_one_get_one" }],
    ["un point contraire à l'acheminement", { applicationPoint: "basket" }],
    ["une pause à moitié écrite", { pausedAt: FROM }],
    ["une condition inconnue", { conditions: [{ kind: "promo_code", value: 1 }] }],
    ["une origine inconnue", { origin: { kind: "ailleurs" } }],
  ])("refuse en la nommant une ligne avec %s", (_case, patch) => {
    const promotion = Promotion.pose("promo_1", lineTerms(), "staff_1", FROM);
    expect(() => toDomain({ ...rowOf(promotion), ...patch }, [])).toThrow(
      UnreadablePromotionRowError,
    );
  });
});
