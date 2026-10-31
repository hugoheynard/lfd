import { UnreadablePromotionRowError } from "../../domain/errors/promotion-errors.js";
import { Promotion } from "../../domain/promotion.js";
import { PromotionAudienceSet } from "../../domain/promotion-audience-set.js";
import { FROM, basketTerms, lineTerms } from "../../domain/__tests__/promotion-terms.fixture.js";
import {
  audienceTargetRowsOf,
  type PromotionAudienceTargetRow,
} from "../promotion-audience-rows.js";
import {
  fulfillmentLinkRowsOf,
  type PromotionFulfillmentLinkRows,
} from "../promotion-fulfillment-rows.js";
import { scopeRuleRowsOf, toDomain, toPersistence, type PromotionRow } from "../promotion-rows.js";

type ReadRow = PromotionRow & PromotionFulfillmentLinkRows;

/** La ligne telle que le dépôt la relit : colonnes, et liaisons des points et des zones. */
function rowOf(promotion: Promotion): ReadRow {
  const { points, zones } = fulfillmentLinkRowsOf(promotion);
  return {
    ...toPersistence(promotion),
    origin: null,
    pickupPoints: points.map(({ pickupId }) => ({ pickupId })),
    deliveryZones: zones.map(({ zoneId }) => ({ zoneId })),
  };
}

/** Les cibles telles que l'adaptateur les écrit, à identifiants numérotés. */
function targetsOf(promotion: Promotion): PromotionAudienceTargetRow[] {
  let next = 0;
  return audienceTargetRowsOf(promotion, () => `t_${(next += 1)}`);
}

/** Relire une promotion comme le dépôt : sa ligne, sa portée, ses cibles. */
function reread(promotion: Promotion, row: ReadRow = rowOf(promotion)): Promotion {
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
      "une promotion de panier sur deux points et une zone (plan des acheminements)",
      basketTerms({
        fulfillment: {
          kind: "basket",
          pickup: { points: ["pk_gare", "pk_coeur"] },
          delivery: { zones: ["zone_vallee"] },
        },
      }),
    ],
    [
      "une promotion de panier sur tous les points et toutes les zones",
      basketTerms({ fulfillment: { kind: "basket", pickup: "all", delivery: "all" } }),
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

  it.each([
    ["un plancher propre inconnu", { ownFloorMode: "ratio", ownFloorValue: 1 }],
    ["un archivage à moitié écrit (sans motif)", { archivedAt: FROM, archivedBy: "staff_1" }],
    ["une pause sans auteur", { pausedBy: "staff_1" }],
    ["un mode de portée inconnu", { scopeMode: "tout" }],
    ["des conditions qui ne sont pas une liste", { conditions: { kind: "min_quantity" } }],
    ["une origine qui n'est pas un objet", { origin: "reprise" }],
    ["un acheminement coché sur une promotion de ligne", { fulfillmentPickup: "all" }],
  ])("refuse en la nommant une ligne avec %s", (_case, patch) => {
    const promotion = Promotion.pose("promo_1", lineTerms(), "staff_1", FROM);
    expect(() => reread(promotion, { ...rowOf(promotion), ...patch })).toThrow(
      UnreadablePromotionRowError,
    );
  });

  /** Plan des acheminements, § 8.4 : jamais un ensemble vide silencieux. */
  it("refuse une sélection de points relue sans aucune ligne de liaison", () => {
    const promotion = Promotion.pose("promo_1", basketTerms(), "staff_1", FROM);
    const row = { ...rowOf(promotion), pickupPoints: [] };
    expect(() => reread(promotion, row)).toThrow(UnreadablePromotionRowError);
  });

  it.each([
    ["un mode de retrait inconnu", { fulfillmentPickup: "drone" }],
    ["un mode de livraison absent au panier", { fulfillmentDelivery: null }],
    ["une zone liée sous « aucune livraison »", { deliveryZones: [{ zoneId: "zone_vallee" }] }],
  ])("refuse en la nommant une promotion de panier avec %s", (_case, patch) => {
    const promotion = Promotion.pose("promo_1", basketTerms(), "staff_1", FROM);
    expect(() => reread(promotion, { ...rowOf(promotion), ...patch })).toThrow(
      UnreadablePromotionRowError,
    );
  });

  it("écrit les modes et les liaisons d'un point et d'une zone, dans l'ordre trié", () => {
    const promotion = Promotion.pose(
      "promo_1",
      basketTerms({
        fulfillment: {
          kind: "basket",
          pickup: { points: ["pk_gare", "pk_coeur"] },
          delivery: { zones: ["zone_vallee"] },
        },
      }),
      "staff_1",
      FROM,
    );
    const row = rowOf(promotion);
    expect([row.applicationPoint, row.fulfillmentPickup, row.fulfillmentDelivery]).toEqual([
      "basket",
      "listed",
      "listed",
    ]);
    expect(fulfillmentLinkRowsOf(promotion)).toEqual({
      points: [
        { promotionId: "promo_1", pickupId: "pk_coeur" },
        { promotionId: "promo_1", pickupId: "pk_gare" },
      ],
      zones: [{ promotionId: "promo_1", zoneId: "zone_vallee" }],
    });
  });

  it("n'écrit aucun mode pour une promotion « dans le prix affiché »", () => {
    const row = rowOf(Promotion.pose("promo_1", lineTerms(), "staff_1", FROM));
    expect([row.applicationPoint, row.fulfillmentPickup, row.fulfillmentDelivery]).toEqual([
      "line",
      null,
      null,
    ]);
  });

  it("refuse une règle de portée à cible inconnue, et un public à cible inconnue", () => {
    const promotion = Promotion.pose("promo_1", SCOPED, "staff_1", FROM);
    const rules = scopeRuleRowsOf(promotion).map((rule, i) =>
      i === 0 ? { ...rule, target: "rayon" } : rule,
    );
    expect(() => toDomain(rowOf(promotion), rules, targetsOf(promotion))).toThrow(
      UnreadablePromotionRowError,
    );
    const targets = targetsOf(promotion).map((target) => ({ ...target, kind: "vip" }));
    expect(() => toDomain(rowOf(promotion), scopeRuleRowsOf(promotion), targets)).toThrow(
      UnreadablePromotionRowError,
    );
  });

  it("relit un archivage complet et une pause complète tels qu'écrits, auteur compris", () => {
    const promotion = Promotion.pose("promo_1", lineTerms(), "staff_1", FROM)
      .pause("staff_2", FROM)
      .archive("staff_3", FROM, "fin de saison");
    const state = reread(promotion).toPersistence();
    expect(state.paused).toEqual({ at: FROM, by: "staff_2" });
    expect(state.archived).toEqual({ at: FROM, by: "staff_3", reason: "fin de saison" });
  });

  it("aller-retour des trois états d'un libellé : `null`, absent, posé — et `it` sans `en` ne se perd pas", () => {
    const promotion = Promotion.pose(
      "promo_1",
      lineTerms({
        label: { fr: "Fr", en: null, it: "Solo italiano" },
        audienceLabels: {
          individuals: { fr: "Part", en: null, it: "Privati" },
          pros: null,
        },
        audiences: PromotionAudienceSet.of([{ kind: "everyone" }]),
      }),
      "staff_1",
      FROM,
    );
    const row = rowOf(promotion);
    expect([row.labelEn, row.labelIt, row.labelIndividualsIt, row.labelProsFr]).toEqual([
      null,
      "Solo italiano",
      "Privati",
      null,
    ]);
    const again = reread(promotion).terms;
    expect(again.label).toEqual({ fr: "Fr", en: null, it: "Solo italiano" });
    expect(again.audienceLabels).toEqual({
      individuals: { fr: "Part", en: null, it: "Privati" },
      pros: null,
    });
  });

  it("aller-retour de la fenêtre et des options de ligne : cumulable, plancher, mercuriale, fin", () => {
    const promotion = Promotion.pose(
      "promo_1",
      lineTerms({
        cumulative: true,
        stacksOverMercuriale: true,
        ownFloor: { mode: "amount", value: 12_345 },
        validTo: new Date(FROM.getTime() + 1),
      }),
      "staff_1",
      FROM,
    );
    const again = reread(promotion).terms;
    expect(again).toMatchObject({
      cumulative: true,
      stacksOverMercuriale: true,
      ownFloor: { mode: "amount", value: 12_345 },
      validTo: new Date(FROM.getTime() + 1),
    });
  });
});
