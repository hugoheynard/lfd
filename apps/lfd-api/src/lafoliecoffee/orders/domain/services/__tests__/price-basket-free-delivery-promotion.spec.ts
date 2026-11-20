import type { BasketCart, DeliveryBasketRoute } from "../basket-pricing-context.js";
import {
  chosenFreeDeliveryCandidate,
  type FreeDeliveryCandidate,
} from "../free-delivery-candidates.js";
import { priceBasket } from "../price-basket.js";
import {
  ASKED_AT,
  livePromotion,
} from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import type { PromotionAudienceFacts } from "../../../../promotions/domain/promotion-targeting.js";
import { BOISSON, PAIN, PICKUP, contextOf } from "./price-basket.fixture.js";

/**
 * **La livraison offerte par une promotion** (`plan-livraison-offerte.md`,
 * § 2.2 à § 2.4, § 2.7) — un seuil de plus, pour un public : le calcul
 * retient le plus favorable parmi le franco de la route et les promotions
 * « Sur la livraison » qui admettent l'acheteur.
 */
const PRO: BasketCart = { vatMethod: "line_ht", handoverAt: null };
const NO_VERDICT = { lateFee: null };
const FIDELE = "co_fidele";
const ZONE = "zone_1";
const ADDRESS: DeliveryBasketRoute["address"] = {
  label: "",
  ligne1: "2 rue du Test",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};
const LABEL = { fr: "Client fidèle", en: "Loyal customer", it: "Cliente fedele" };

/** « Livraison offerte » pour la société {@link FIDELE}, dès `minBasket` centimes HT. */
function offeredTo(
  companyId: string,
  minBasket: number | null,
  id = "promo_livraison",
): LivePromotion {
  return livePromotion({
    id,
    label: LABEL.fr,
    effect: { kind: "free_delivery" },
    audience: { kind: "company", companyId },
    fulfillment: { kind: "delivery_fee", delivery: "all" },
    conditions: minBasket === null ? [] : [{ kind: "min_basket", cents: minBasket }],
  });
}

function factsOf(companyId: string | null): PromotionAudienceFacts {
  return {
    companyId,
    companyStatus: companyId === null ? null : "active",
    principal: { companyId: null },
    buyerKind: "registered",
    fulfillment: { method: "delivery", zoneId: ZONE },
  };
}

/** Un panier de `breads` pains et une boisson (10 € HT chacun), livré, frais 10 € HT. */
function priced(options: {
  readonly breads: number;
  readonly routeThreshold: number | null;
  readonly promotions: readonly LivePromotion[];
  readonly buyer?: string | null;
  readonly fee?: DeliveryBasketRoute["fee"];
}) {
  const route: DeliveryBasketRoute = {
    method: "delivery",
    zoneId: ZONE,
    address: ADDRESS,
    fee: options.fee ?? { mode: "amount", cents: 1_000 },
    freeDeliveryThresholdCents: options.routeThreshold,
    globalWindowMode: "slot",
    deliveryFeePromotions: {
      at: ASKED_AT,
      live: options.promotions,
      facts: factsOf(options.buyer === undefined ? FIDELE : options.buyer),
    },
  };
  return priceBasket(
    contextOf({ route, lines: [{ ...PAIN, quantity: options.breads }, BOISSON] }),
    PRO,
    NO_VERDICT,
  );
}

describe("priceBasket — la livraison offerte par une promotion", () => {
  it("franco 80 € + promotion de la société à 0 € : offerte, et la promotion nommée", () => {
    const amounts = priced({
      breads: 1,
      routeThreshold: 8_000,
      promotions: [offeredTo(FIDELE, null)],
    });

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery).toEqual({
      thresholdCents: 8_000,
      waivedCents: 1_000,
      waivedTtcCents: null,
      promotion: {
        promotionId: "promo_livraison",
        thresholdCents: 0,
        label: { fr: LABEL.fr, en: LABEL.fr, it: LABEL.fr },
      },
    });
    expect(amounts.freeDeliveryProgress).toEqual({
      status: "offered",
      label: { fr: LABEL.fr, en: LABEL.fr, it: LABEL.fr },
    });
  });

  it("promotion 50 € + franco 80 €, panier 60 € : offerte par la promotion", () => {
    const amounts = priced({
      breads: 5,
      routeThreshold: 8_000,
      promotions: [offeredTo(FIDELE, 5_000)],
    });

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery?.promotion?.thresholdCents).toBe(5_000);
    // Le seuil de la ROUTE reste le sien (§ 2.8, B3), même non atteint.
    expect(amounts.terms.freeDelivery?.thresholdCents).toBe(8_000);
  });

  it("promotion 50 € + franco 80 €, panier 40 € : « Plus que 10 € », sur le seuil le plus bas", () => {
    const amounts = priced({
      breads: 3,
      routeThreshold: 8_000,
      promotions: [offeredTo(FIDELE, 5_000)],
    });

    expect(amounts.terms.freeDelivery).toBeNull();
    expect(amounts.terms.deliveryFeeCents).toBe(1_000);
    expect(amounts.freeDeliveryProgress).toEqual({ status: "short", remainingCents: 1_000 });
  });

  it("panier 90 € : la route et la promotion atteintes, la plus basse l'emporte", () => {
    const amounts = priced({
      breads: 8,
      routeThreshold: 8_000,
      promotions: [offeredTo(FIDELE, 5_000)],
    });

    expect(amounts.terms.freeDelivery?.promotion?.promotionId).toBe("promo_livraison");
  });

  it("le franco de la route plus bas que la promotion : la route offre, sans promotion", () => {
    const amounts = priced({
      breads: 8,
      routeThreshold: 3_000,
      promotions: [offeredTo(FIDELE, 5_000)],
    });

    expect(amounts.terms.freeDelivery).toMatchObject({ thresholdCents: 3_000, promotion: null });
    expect(amounts.freeDeliveryProgress).toEqual({ status: "offered" });
  });

  it("offerte par une promotion sans franco de route : le seuil de route reste nul", () => {
    const amounts = priced({
      breads: 1,
      routeThreshold: null,
      promotions: [offeredTo(FIDELE, null)],
    });

    expect(amounts.terms.freeDelivery).toMatchObject({ thresholdCents: null, waivedCents: 1_000 });
  });

  it("la promotion d'une autre société : rien", () => {
    const amounts = priced({
      breads: 1,
      routeThreshold: null,
      promotions: [offeredTo("co_voisine", null)],
    });

    expect(amounts.terms.freeDelivery).toBeNull();
    expect(amounts.terms.deliveryFeeCents).toBe(1_000);
    expect(amounts.freeDeliveryProgress).toBeNull();
  });

  it("un particulier sans société : la promotion d'une société ne l'admet pas", () => {
    const amounts = priced({
      breads: 1,
      routeThreshold: null,
      promotions: [offeredTo(FIDELE, null)],
      buyer: null,
    });

    expect(amounts.terms.freeDelivery).toBeNull();
  });

  it("une zone à frais nul : rien n'est figé, ni source ni libellé", () => {
    const amounts = priced({
      breads: 1,
      routeThreshold: null,
      promotions: [offeredTo(FIDELE, null)],
      fee: { mode: "amount", cents: 0 },
    });

    expect(amounts.terms.freeDelivery).toBeNull();
    expect(amounts.freeDeliveryProgress).toBeNull();
  });

  it("le retrait : rien, même avec une promotion « toutes les zones »", () => {
    const amounts = priceBasket(contextOf({ route: PICKUP }), PRO, NO_VERDICT);

    expect(amounts.terms.freeDelivery).toBeNull();
    expect(amounts.freeDeliveryProgress).toBeNull();
  });

  it("une promotion de livraison n'entre pas dans le choix des remises au panier", () => {
    const amounts = priced({
      breads: 1,
      routeThreshold: null,
      promotions: [offeredTo(FIDELE, null)],
    });

    expect(amounts.terms.discountPromotionId).toBeNull();
    expect(amounts.terms.discountCents).toBe(0);
  });
});

describe("chosenFreeDeliveryCandidate — le seuil retenu", () => {
  const route = (thresholdCents: number): FreeDeliveryCandidate => ({
    thresholdCents,
    source: { kind: "route" },
  });
  const promotion = (thresholdCents: number, promotionId: string): FreeDeliveryCandidate => ({
    thresholdCents,
    source: { kind: "promotion", promotionId, label: LABEL },
  });

  it("sans candidat : aucun", () => {
    expect(chosenFreeDeliveryCandidate([], 10_000)).toBeNull();
  });

  it("à seuil égal, la promotion l'emporte sur la route, puis le plus petit identifiant", () => {
    expect(chosenFreeDeliveryCandidate([route(5_000), promotion(5_000, "p_b")], 6_000)).toEqual(
      promotion(5_000, "p_b"),
    );
    expect(
      chosenFreeDeliveryCandidate([promotion(5_000, "p_b"), promotion(5_000, "p_a")], 6_000),
    ).toEqual(promotion(5_000, "p_a"));
  });

  it("aucun atteint : le plus bas, pour « Plus que … »", () => {
    expect(chosenFreeDeliveryCandidate([route(8_000), promotion(5_000, "p")], 1_000)).toEqual(
      promotion(5_000, "p"),
    );
  });

  it("« dès » le seuil : atteint à la valeur pile", () => {
    expect(chosenFreeDeliveryCandidate([route(8_000)], 8_000)).toEqual(route(8_000));
  });
});
