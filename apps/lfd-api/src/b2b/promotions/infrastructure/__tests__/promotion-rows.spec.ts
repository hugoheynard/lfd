import { UnreadablePromotionRowError } from "../../domain/errors/promotion-errors.js";
import { Promotion } from "../../domain/promotion.js";
import { PromotionAudienceSet } from "../../domain/promotion-audience-set.js";
import { FROM, basketTerms, lineTerms } from "../../domain/__tests__/promotion-terms.fixture.js";
import {
  audienceTargetRowsOf,
  type PromotionAudienceTargetRow,
} from "../promotion-audience-rows.js";
import { scopeRuleRowsOf, toDomain, toPersistence, type PromotionRow } from "../promotion-rows.js";

function rowOf(promotion: Promotion): PromotionRow {
  return { ...toPersistence(promotion), origin: null };
}

/** Les cibles telles que l'adaptateur les écrit, à identifiants numérotés. */
function targetsOf(promotion: Promotion): PromotionAudienceTargetRow[] {
  let next = 0;
  return audienceTargetRowsOf(promotion, () => `t_${(next += 1)}`);
}

/** Relire une promotion comme le dépôt : sa ligne, sa portée, ses cibles. */
function reread(promotion: Promotion, row: PromotionRow = rowOf(promotion)): Promotion {
  return toDomain(row, scopeRuleRowsOf(promotion), targetsOf(promotion));
}

const THREE_PUBLICS = lineTerms({
  audiences: PromotionAudienceSet.of([
    { kind: "individuals_registered" },
    { kind: "pros" },
    { kind: "company", companyId: "co_1" },
  ]),
  audienceLabels: {
    individuals: { fr: "Offre inscrits", en: "Members offer", it: null },
    pros: { fr: "Offre pros", en: null, it: null },
  },
});

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
    expect(reread(promotion).toPersistence()).toEqual(promotion.toPersistence());
  });

  it("aller-retour sans perte d'un public à trois cibles et de ses libellés d'audience (L8b)", () => {
    const promotion = Promotion.pose("promo_1", THREE_PUBLICS, "staff_1", FROM);
    expect(reread(promotion).toPersistence()).toEqual(promotion.toPersistence());
  });

  it("projette un public à plusieurs cibles en `several`, une cible seule en elle-même", () => {
    const several = rowOf(Promotion.pose("promo_1", THREE_PUBLICS, "staff_1", FROM));
    expect([several.audienceKind, several.audienceCompanyId]).toEqual(["several", null]);
    const one = rowOf(
      Promotion.pose(
        "promo_2",
        lineTerms({ audience: { kind: "company", companyId: "co_1" } }),
        "staff_1",
        FROM,
      ),
    );
    expect([one.audienceKind, one.audienceCompanyId]).toEqual(["company", "co_1"]);
  });

  it("refuse une promotion sans cible plutôt que de relire la projection", () => {
    const promotion = Promotion.pose("promo_1", lineTerms(), "staff_1", FROM);
    expect(() => toDomain(rowOf(promotion), [], [])).toThrow(UnreadablePromotionRowError);
  });

  it("garde `tous sauf les pros actifs` d'une reprise, tel quel", () => {
    const promotion = Promotion.pose("pd_1", basketTerms(), "system:reprise-promotions", FROM);
    expect(reread(promotion).terms.audiences.targets).toEqual([
      { kind: "everyone_but_active_pros" },
    ]);
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
    expect(reread(promotion, { ...rowOf(promotion), origin }).toPersistence().origin).toEqual(
      origin,
    );
  });

  it.each([
    ["un effet inconnu", { effectKind: "buy_one_get_one" }],
    ["un point contraire à l'acheminement", { applicationPoint: "basket" }],
    ["une pause à moitié écrite", { pausedAt: FROM }],
    ["une condition inconnue", { conditions: [{ kind: "promo_code", value: 1 }] }],
    ["une origine inconnue", { origin: { kind: "ailleurs" } }],
  ])("refuse en la nommant une ligne avec %s", (_case, patch) => {
    const promotion = Promotion.pose("promo_1", lineTerms(), "staff_1", FROM);
    expect(() => reread(promotion, { ...rowOf(promotion), ...patch })).toThrow(
      UnreadablePromotionRowError,
    );
  });
});
