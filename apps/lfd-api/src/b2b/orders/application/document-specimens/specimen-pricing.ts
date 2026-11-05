import type { BillingAddressPayload, CartAdjustment } from "@lfd/contracts";

import type { LivePromotion } from "../../../promotions/domain/live-promotion.js";
import { NO_AUDIENCE_LABELS } from "../../../promotions/domain/promotion-labels.js";
import { PREVIEWED_FACTS } from "../../../promotions/domain/promotion-targeting.js";
import type { OrderPricingRequest } from "../../domain/entities/order-priced-draft.js";
import type { BasketRoute } from "../../domain/services/basket-pricing-context.js";
import type { OrderLineInput } from "../../domain/value-objects/order-line.js";

/**
 * **Le panier chargé des bons d'exemple** — la planche des documents
 * (`documentation/comptabilite/planche-des-documents.md`).
 *
 * Depuis le 2026-11-04 (L7, 2a), `Order.draft` ne reçoit plus de montants :
 * il chiffre le panier lui-même par `priceBasket`. Le spécimen lui donne donc
 * ce que `PricingContext` aurait chargé — les lignes, l'acheminement, et une
 * promotion vivante écrite ici en instantané, jamais lue en base : aucun
 * réglage réel n'entre dans un papier d'exemple.
 */

/** Le libellé de la remise d'exemple, dans les trois langues du client. */
const SPECIMEN_DISCOUNT_LABEL = {
  fr: "Remise retrait −5 %",
  en: "Pickup discount −5%",
  it: "Sconto ritiro −5%",
};

/**
 * **−5 % au retrait, pour tout le monde, hors l'article exclu** — l'instantané
 * d'une promotion panier telle que la caisse la recevrait. Ouverte à
 * l'instant même du bon : `at` et `validFrom` sont le même `now`, lu par
 * l'appelant (CLAUDE.md § 3.2).
 */
export function specimenPickupPromotion(
  adjustment: CartAdjustment & { readonly mode: "percent" },
  excludedSku: string,
  now: Date,
): LivePromotion {
  return {
    id: "specimen-promotion",
    label: SPECIMEN_DISCOUNT_LABEL,
    audienceLabels: NO_AUDIENCE_LABELS,
    tileText: null,
    effect: { kind: "percent_off", basisPoints: adjustment.bp },
    cumulative: false,
    validFrom: now,
    validTo: null,
    suspendedFrom: null,
    audiences: [{ kind: "everyone" }],
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    scope: {
      mode: "all_except",
      rules: [{ target: "variant", targetId: excludedSku, eligible: false, targetRank: null }],
    },
    conditions: [],
  };
}

/** Le retrait au point d'exemple, sans site rattaché. */
export function specimenPickupRoute(point: BillingAddressPayload): BasketRoute {
  return { method: "pickup", point };
}

/** La livraison en zone d'exemple, à ce barème. */
export function specimenDeliveryRoute(
  zoneId: string,
  address: BillingAddressPayload,
  fee: CartAdjustment,
): BasketRoute {
  // Sans franco : la planche montre le frais facturé.
  return {
    method: "delivery",
    zoneId,
    address,
    fee,
    freeDeliveryThresholdCents: null,
    globalWindowMode: "slot",
  };
}

/** Ce que l'agrégat chiffre : ces lignes, cet acheminement, ces promotions, à `now`. */
export function specimenPricing(
  lines: readonly OrderLineInput[],
  route: BasketRoute,
  promotions: readonly LivePromotion[],
  now: Date,
): OrderPricingRequest {
  return {
    context: {
      lines,
      sealing: new Map(),
      known: new Map(),
      route,
      promotions: {
        at: now,
        live: promotions,
        facts: {
          ...PREVIEWED_FACTS,
          fulfillment:
            route.method === "pickup"
              ? { method: "pickup", pickupId: null }
              : { method: "delivery", zoneId: route.zoneId },
        },
      },
      replayed: null,
      deliveryVatMode: "standard",
    },
    handoverAt: null,
    verdicts: { lateFee: null },
  };
}
