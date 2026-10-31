import {
  fulfillmentOffersFor,
  offerCandidates,
  offerEffectOf,
  offersNeedProducts,
  signInOfferFor,
  type OfferedLine,
} from "../promotion-offers.js";
import type { PromotionAudienceFacts } from "../promotion-targeting.js";
import { ASKED_AT, LIVE_FROM, livePromotion } from "./live-promotion.fixture.js";

/**
 * Ce qu'une promotion promet sans s'appliquer (lot L10) : la mention du rayon
 * et le message à l'invité. Les dates ne sont comparées qu'entre elles.
 */

const INDIVIDUAL: PromotionAudienceFacts = {
  companyId: null,
  companyStatus: null,
  principal: { companyId: null },
  buyerKind: "guest",
  fulfillment: null,
};

const EN_RETRAIT = livePromotion({
  id: "retrait",
  fulfillment: { kind: "basket", pickup: { points: ["pickup_1"] }, delivery: "none" },
});

const PAIN = { sku: "PAIN-1", productId: "prod_pain", categoryPath: ["fam_pains"] };

const LINE_OF_PAIN: OfferedLine = {
  article: PAIN,
  saleUnit: "piece",
  quantity: 1,
};

describe("offerEffectOf — l'effet tel qu'il se dit", () => {
  it("dit un pourcentage, un montant par article, un montant de panier en millicentimes", () => {
    expect(offerEffectOf({ kind: "percent_off", basisPoints: 2_000 })).toEqual({
      kind: "percent",
      basisPoints: 2_000,
    });
    expect(offerEffectOf({ kind: "unit_amount_off", millicents: 50_000 })).toEqual({
      kind: "amount",
      millicents: 50_000,
    });
    expect(offerEffectOf({ kind: "basket_amount_off", cents: 500 })).toEqual({
      kind: "amount",
      millicents: 500_000,
    });
  });

  it("ne dit rien d'un prix posé, qui n'est pas un « −X »", () => {
    expect(offerEffectOf({ kind: "fixed_unit_price", millicents: 100_000 })).toBeNull();
  });
});

describe("offerCandidates — ce que le rayon peut mentionner", () => {
  it("garde une promotion de panier sans connaître l'acheminement", () => {
    expect(offerCandidates([EN_RETRAIT], ASKED_AT, INDIVIDUAL).map((p) => p.id)).toEqual([
      "retrait",
    ]);
  });

  it("écarte une promotion de ligne : celle-là baisse déjà le prix", () => {
    expect(offerCandidates([livePromotion()], ASKED_AT, INDIVIDUAL)).toEqual([]);
  });

  it("écarte un public qui n'admet pas le lecteur, une pause et une fenêtre close", () => {
    const candidates = offerCandidates(
      [
        { ...EN_RETRAIT, id: "pros", audiences: [{ kind: "pros" }] },
        { ...EN_RETRAIT, id: "pause", suspendedFrom: LIVE_FROM },
        { ...EN_RETRAIT, id: "close", validTo: LIVE_FROM, validFrom: new Date(0) },
      ],
      ASKED_AT,
      INDIVIDUAL,
    );

    expect(candidates).toEqual([]);
  });
});

describe("fulfillmentOffersFor — la mention sur un article", () => {
  it("mentionne une promotion dont la portée couvre l'article", () => {
    expect(fulfillmentOffersFor([EN_RETRAIT], PAIN)).toEqual([
      {
        promotionId: "retrait",
        effect: { kind: "percent", basisPoints: 2_000 },
        fulfillment: { pickup: { points: ["pickup_1"] }, delivery: "none" },
      },
    ]);
  });

  /** Plan des acheminements, § 8.4 : une offre porte l'ENSEMBLE, la boutique choisit quoi dire. */
  it("porte l'ensemble d'une promotion « un point + une zone »", () => {
    const both = livePromotion({
      id: "point_zone",
      fulfillment: {
        kind: "basket",
        pickup: { points: ["pickup_1"] },
        delivery: { zones: ["zone_vallee"] },
      },
    });
    expect(fulfillmentOffersFor([both], PAIN)).toEqual([
      {
        promotionId: "point_zone",
        effect: { kind: "percent", basisPoints: 2_000 },
        fulfillment: { pickup: { points: ["pickup_1"] }, delivery: { zones: ["zone_vallee"] } },
      },
    ]);
  });

  it("ne mentionne jamais une promotion « dans le prix affiché » — elle baisse déjà le prix", () => {
    expect(fulfillmentOffersFor([livePromotion({ id: "ligne" })], PAIN)).toEqual([]);
  });

  it("ne mentionne pas un article que la portée exclut", () => {
    const excluded = {
      ...EN_RETRAIT,
      scope: {
        mode: "all_except" as const,
        rules: [
          { target: "product" as const, targetId: "prod_pain", eligible: false, targetRank: null },
        ],
      },
    };

    expect(fulfillmentOffersFor([excluded], PAIN)).toEqual([]);
    expect(offersNeedProducts([excluded])).toBe(true);
    expect(offersNeedProducts([EN_RETRAIT])).toBe(false);
  });

  it("ne mentionne pas un prix posé", () => {
    const posed = { ...EN_RETRAIT, effect: { kind: "fixed_unit_price" as const, millicents: 1 } };

    expect(fulfillmentOffersFor([posed], PAIN)).toEqual([]);
  });
});

describe("signInOfferFor — ce qu'une connexion ouvrirait à un invité", () => {
  const INSCRITS = livePromotion({ id: "inscrits", audience: { kind: "individuals_registered" } });

  it("dit la promotion réservée aux inscrits qui touche le panier", () => {
    expect(signInOfferFor([INSCRITS], ASKED_AT, [LINE_OF_PAIN], null)).toEqual({
      effect: { kind: "percent", basisPoints: 2_000 },
    });
  });

  /**
   * Régression : une promotion « inscrits » à quantité minimum était proposée
   * (« profitez de −20 % ») sur un panier sous le seuil, où la caisse ne
   * retire rien après connexion (fix 2026-10-31).
   */
  it("ne promet pas une promotion dont la quantité minimum n'est pas atteinte", () => {
    const fromTen = livePromotion({
      id: "inscrits-dix",
      audience: { kind: "individuals_registered" },
      conditions: [{ kind: "min_quantity", value: 10 }],
    });
    expect(signInOfferFor([fromTen], ASKED_AT, [LINE_OF_PAIN], null)).toBeUndefined();
    expect(signInOfferFor([fromTen], ASKED_AT, [{ ...LINE_OF_PAIN, quantity: 10 }], null)).toEqual({
      effect: { kind: "percent", basisPoints: 2_000 },
    });
  });

  it("ne dit rien d'une promotion qu'un invité a déjà", () => {
    const everyone = livePromotion({ id: "tous" });
    const individuals = livePromotion({ id: "particuliers", audience: { kind: "individuals" } });

    expect(signInOfferFor([everyone, individuals], ASKED_AT, [LINE_OF_PAIN], null)).toBeUndefined();
  });

  it("ne dit rien quand la portée ne touche aucune ligne", () => {
    const elsewhere = {
      ...INSCRITS,
      scope: {
        mode: "only" as const,
        rules: [
          { target: "category" as const, targetId: "fam_autre", eligible: true, targetRank: null },
        ],
      },
    };

    expect(signInOfferFor([elsewhere], ASKED_AT, [LINE_OF_PAIN], null)).toBeUndefined();
  });

  it("écarte une promotion de retrait quand le panier part en livraison", () => {
    const pickup = {
      ...INSCRITS,
      fulfillment: { kind: "basket" as const, pickup: "all" as const, delivery: "none" as const },
    };

    expect(
      signInOfferFor([pickup], ASKED_AT, [LINE_OF_PAIN], { method: "delivery", zoneId: null }),
    ).toBeUndefined();
    expect(signInOfferFor([pickup], ASKED_AT, [LINE_OF_PAIN], null)).toBeDefined();
  });

  /** Plan des acheminements, § 8.1 : la zone entre dans le fait. */
  it("offre une promotion « point + zone » dans la zone et au point, pas ailleurs", () => {
    const both = {
      ...INSCRITS,
      fulfillment: {
        kind: "basket" as const,
        pickup: { points: ["pickup_1"] },
        delivery: { zones: ["zone_vallee"] },
      },
    };
    const offer = (fact: Parameters<typeof signInOfferFor>[3]) =>
      signInOfferFor([both], ASKED_AT, [LINE_OF_PAIN], fact);

    expect(offer({ method: "delivery", zoneId: "zone_vallee" })).toBeDefined();
    expect(offer({ method: "pickup", pickupId: "pickup_1" })).toBeDefined();
    expect(offer({ method: "delivery", zoneId: "zone_sommet" })).toBeUndefined();
    expect(offer({ method: "delivery", zoneId: null })).toBeUndefined();
    expect(offer({ method: "pickup", pickupId: "pickup_2" })).toBeUndefined();
    // Point pas encore choisi : seul « tous les points » l'admettrait.
    expect(offer({ method: "pickup", pickupId: null })).toBeUndefined();
  });

  it("préfère le plus fort pourcentage, puis un montant, puis un prix posé sans montant", () => {
    const ten = {
      ...INSCRITS,
      id: "a_dix",
      effect: { kind: "percent_off" as const, basisPoints: 1_000 },
    };
    const amount = {
      ...INSCRITS,
      id: "b_montant",
      effect: { kind: "unit_amount_off" as const, millicents: 9 },
    };
    const posed = {
      ...INSCRITS,
      id: "c_pose",
      effect: { kind: "fixed_unit_price" as const, millicents: 1 },
    };

    expect(signInOfferFor([ten, amount, posed, INSCRITS], ASKED_AT, [LINE_OF_PAIN], null)).toEqual({
      effect: { kind: "percent", basisPoints: 2_000 },
    });
    expect(signInOfferFor([posed, amount], ASKED_AT, [LINE_OF_PAIN], null)).toEqual({
      effect: { kind: "amount", millicents: 9 },
    });
    expect(signInOfferFor([posed], ASKED_AT, [LINE_OF_PAIN], null)).toEqual({ effect: null });
  });
});
