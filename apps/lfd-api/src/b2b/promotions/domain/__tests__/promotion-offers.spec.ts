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
  fulfillment: { kind: "pickup_point", pickupId: "pickup_1" },
});

const PAIN = { sku: "PAIN-1", productId: "prod_pain", categoryPath: ["fam_pains"] };

const LINE_OF_PAIN: OfferedLine = { article: PAIN, point: { kind: "line", saleUnit: "piece" } };

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
        fulfillment: { kind: "pickup_point", pickupId: "pickup_1" },
      },
    ]);
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
    const pickup = { ...INSCRITS, fulfillment: { kind: "pickup" as const } };

    expect(
      signInOfferFor([pickup], ASKED_AT, [LINE_OF_PAIN], { method: "delivery", pickupId: null }),
    ).toBeUndefined();
    expect(signInOfferFor([pickup], ASKED_AT, [LINE_OF_PAIN], null)).toBeDefined();
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
