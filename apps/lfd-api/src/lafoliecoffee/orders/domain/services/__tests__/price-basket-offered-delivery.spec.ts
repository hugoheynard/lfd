import type { LateFeeAdjustment } from "@lfd/contracts";

import type { BasketCart, DeliveryBasketRoute } from "../basket-pricing-context.js";
import { priceBasket } from "../price-basket.js";
import {
  ASKED_AT,
  livePromotion,
} from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import { BOISSON, PAIN, PICKUP, contextOf } from "./price-basket.fixture.js";

/**
 * **Le port offert d'une commande issue d'un reliquat** (`documentation/commandes/reliquat/reliquat.md`,
 * § 6.6, décision 7) : la route arrive avec un franco de 0, toujours atteint, et
 * `priceBasket` fige une livraison offerte. Aucune règle neuve ici : ces cas
 * épinglent que le franco existant suffit, et que l'ordre des frais ne rend
 * jamais un port non nul que le CHECK `orders_delivery_offered_waives_fee`
 * refuserait en 500.
 */
const PRO: BasketCart = { vatMethod: "line_ht", handoverAt: null };
const PUBLIC: BasketCart = { vatMethod: "exact_ht", handoverAt: null };
const NO_VERDICT = { lateFee: null };
const OFFERED_THRESHOLD = 0;
const ADDRESS: DeliveryBasketRoute["address"] = {
  label: "",
  ligne1: "2 rue du Test",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};
const LABEL = "Livraison offerte aux fidèles";

function freeDeliveryPromotion(minBasket: number | null): LivePromotion {
  return livePromotion({
    id: "promo_livraison",
    label: LABEL,
    effect: { kind: "free_delivery" },
    audience: { kind: "everyone" },
    fulfillment: { kind: "delivery_fee", delivery: "all" },
    conditions: minBasket === null ? [] : [{ kind: "min_basket", cents: minBasket }],
  });
}

function offeredRoute(
  promotions: readonly LivePromotion[] = [],
  over: Partial<DeliveryBasketRoute> = {},
): DeliveryBasketRoute {
  return {
    method: "delivery",
    zoneId: "zone_1",
    address: ADDRESS,
    fee: { mode: "amount", cents: 1_000 },
    freeDeliveryThresholdCents: OFFERED_THRESHOLD,
    globalWindowMode: "slot",
    deliveryFeePromotions: {
      at: ASKED_AT,
      live: promotions,
      facts: {
        companyId: "co_1",
        companyStatus: "active",
        principal: { companyId: null },
        buyerKind: "registered",
        fulfillment: { method: "delivery", zoneId: "zone_1" },
      },
    },
    ...over,
  };
}

describe("priceBasket — le port offert d'une commande issue d'un reliquat (seuil 0)", () => {
  it("dans une zone à frais : port nul, livraison offerte figée par la route, frais retenu", () => {
    const amounts = priceBasket(contextOf({ route: offeredRoute() }), PRO, NO_VERDICT);

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.deliveryFeeAdjustment).toEqual({ mode: "amount", cents: 1_000 });
    expect(amounts.terms.freeDelivery).toEqual({
      thresholdCents: 0,
      waivedCents: 1_000,
      waivedTtcCents: null,
      promotion: null,
    });
    // L'écran dit « offerte », jamais « plus que 0 € ».
    expect(amounts.freeDeliveryProgress).toEqual(expect.objectContaining({ status: "offered" }));
  });

  it("une seule ligne d'un centime suffit : le seuil 0 est toujours atteint", () => {
    const amounts = priceBasket(
      contextOf({
        route: offeredRoute(),
        lines: [{ ...PAIN, unitPriceMillicents: 1_000 }],
      }),
      PRO,
      NO_VERDICT,
    );

    expect(amounts.terms.deliveryFeeCents).toBe(0);
  });

  it("une promotion « Livraison offerte » dès 0 € l'emporte à seuil égal : port nul, crédit à la promotion (assumé)", () => {
    const amounts = priceBasket(
      contextOf({ route: offeredRoute([freeDeliveryPromotion(null)]) }),
      PRO,
      NO_VERDICT,
    );

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery?.promotion?.promotionId).toBe("promo_livraison");
    expect(amounts.terms.freeDelivery?.thresholdCents).toBe(0);
  });

  it("une promotion au seuil non atteint ne rend pas de port : le franco de la route offre", () => {
    const amounts = priceBasket(
      contextOf({ route: offeredRoute([freeDeliveryPromotion(1_000_000)]) }),
      PRO,
      NO_VERDICT,
    );

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery?.promotion).toBeNull();
  });

  it("en TTC (exact_ht) aussi : ni le HT ni le TTC du port ne sont facturés", () => {
    const amounts = priceBasket(
      contextOf({ route: offeredRoute(), lines: [PAIN, BOISSON] }),
      PUBLIC,
      NO_VERDICT,
    );

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery?.waivedTtcCents).not.toBeNull();
  });

  it("en retrait : rien à offrir, aucune livraison offerte figée", () => {
    const amounts = priceBasket(contextOf({ route: PICKUP }), PRO, NO_VERDICT);

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery).toBeNull();
  });

  // Une zone à frais en pourcentage : le port offert vaut le pourcentage du
  // sous-total, qui s'inscrit en `waived` sans jamais se facturer.
  it("zone à frais en % : port nul, le pourcentage offert est figé", () => {
    const route = offeredRoute([], { fee: { mode: "percent", bp: 1_000 } });
    const amounts = priceBasket(contextOf({ route, lines: [PAIN, BOISSON] }), PRO, NO_VERDICT);

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery).toEqual(
      expect.objectContaining({ thresholdCents: 0, waivedCents: 200 }),
    );
  });

  it("zone à frais en %, commande exact_ht : ni HT ni TTC du port ne sont facturés", () => {
    const route = offeredRoute([], { fee: { mode: "percent", bp: 1_000 } });
    const amounts = priceBasket(contextOf({ route, lines: [PAIN, BOISSON] }), PUBLIC, NO_VERDICT);

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery?.waivedTtcCents).toBeGreaterThan(0);
  });

  // Un port déjà gratuit n'a rien à offrir : le calcul ne doit ni échouer ni
  // inventer un frais (le CHECK de la base refuserait un port non nul).
  it("zone à port nul : rien à facturer, aucun refus", () => {
    const route = offeredRoute([], { fee: { mode: "amount", cents: 0 } });
    const amounts = priceBasket(contextOf({ route }), PRO, NO_VERDICT);

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.refusals).toEqual([]);
  });

  // La surtaxe de retard et le port sont deux montants : offrir l'un ne lève
  // pas l'autre (c'est `lateFee: "waive"` qui lève la surtaxe, en amont).
  it("un verdict en rattrapage garde sa surtaxe : le port offert ne l'efface pas", () => {
    const lateFee: LateFeeAdjustment = {
      adjustment: { mode: "amount", cents: 500 },
      vatRatePercent: 20,
    };
    const amounts = priceBasket(contextOf({ route: offeredRoute() }), PRO, { lateFee });

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.lateFeeCents).toBe(500);
  });

  // Non-régression : la même route SANS seuil (zone sans franco) facture son
  // port ; seul le seuil forcé à 0 le fait offrir.
  it("la même zone sans franco, hors port offert : le port est facturé", () => {
    const ordinary = offeredRoute([], { freeDeliveryThresholdCents: null });
    const amounts = priceBasket(contextOf({ route: ordinary }), PRO, NO_VERDICT);

    expect(amounts.terms.deliveryFeeCents).toBe(1_000);
    expect(amounts.terms.freeDelivery).toBeNull();
  });

  // Seuil de promotion = base exacte (inclusif) : la route à 0 est plus basse
  // et l'emporte, la promotion n'est donc pas créditée.
  it("une promotion dont le seuil est exactement la base ne prend pas le crédit : la route à 0 est plus basse", () => {
    const amounts = priceBasket(
      contextOf({ route: offeredRoute([freeDeliveryPromotion(2_000)]), lines: [PAIN, BOISSON] }),
      PRO,
      NO_VERDICT,
    );

    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery?.promotion).toBeNull();
  });

  // « Pas de rejeu » (`null`) et « rejeu sans remise » (`[]`) ne disent pas la
  // même chose : le premier prend les promotions du jour, le second affirme
  // que la commande d'origine n'en portait aucune. Les confondre ferait
  // gagner à un reliquat la remise d'aujourd'hui.
  it("un rejeu sans remise n'applique pas la promotion du jour ; l'absence de rejeu l'applique", () => {
    const today = priceBasket(contextOf({ replayed: null }), PRO, NO_VERDICT);
    const replayed = priceBasket(
      contextOf({ replayed: { lines: [], discounts: [] } }),
      PRO,
      NO_VERDICT,
    );

    expect(today.terms.discountCents).toBeGreaterThan(0);
    expect(replayed.terms.discountCents).toBe(0);
  });
});
