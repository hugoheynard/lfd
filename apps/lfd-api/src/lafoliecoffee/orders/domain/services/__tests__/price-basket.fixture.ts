import { millicentsFromCents } from "@lfd/money";

import {
  ASKED_AT,
  livePromotion,
} from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import { PREVIEWED_FACTS } from "../../../../promotions/domain/promotion-targeting.js";
import type { OrderLineClassification } from "../../ports/order-line-classification.reader.js";
import type { OrderLineInput } from "../../value-objects/order-line.js";
import type { BasketPricingContext, BasketRoute } from "../basket-pricing-context.js";

/**
 * Un panier chargé, construit à la main — ce que `PricingContext` rendrait.
 * L'instant est celui des fixtures de promotions (`ASKED_AT`), comparé à
 * leurs seules fenêtres : `priceBasket` ne lit aucune horloge.
 */

/** Le pain à 5,5 %, la boisson à 20 % : 10 € HT chacun. */
export const PAIN: OrderLineInput = {
  sku: "PAI-001",
  productName: "Pain",
  unitPriceMillicents: millicentsFromCents(1_000),
  vatRate: 5.5,
  saleUnit: "piece",
  quantity: 1,
};
export const BOISSON: OrderLineInput = {
  sku: "BOI-001",
  productName: "Jus",
  unitPriceMillicents: millicentsFromCents(1_000),
  vatRate: 20,
  saleUnit: "piece",
  quantity: 1,
};

export const SITE = "site_labo";

export const PICKUP: BasketRoute = {
  method: "pickup",
  point: {
    siteId: SITE,
    label: "Labo",
    ligne1: "1 rue du Test",
    ligne2: "",
    codePostal: "73000",
    ville: "Chambéry",
    pays: "France",
  },
};

export const DELIVERY: BasketRoute = {
  method: "delivery",
  zoneId: "zone_1",
  address: {
    label: "",
    ligne1: "2 rue du Test",
    ligne2: "",
    codePostal: "73000",
    ville: "Chambéry",
    pays: "France",
  },
  fee: { mode: "amount", cents: 1_000 },
  freeDeliveryThresholdCents: null,
  globalWindowMode: "slot",
};

/** « −10 % sur le panier » au point {@link SITE}, pour tout le monde. */
export const TEN_PERCENT_AT_SITE = livePromotion({
  id: "promo_panier",
  effect: { kind: "percent_off", basisPoints: 1_000 },
  fulfillment: { kind: "basket", pickup: { points: [SITE] }, delivery: "none" },
});

const KNOWN: ReadonlyMap<string, OrderLineClassification> = new Map([
  [
    "PAI-001",
    { productId: "p_pain", categoryId: "c_pains", categoryPath: ["c_pains"], madeToOrder: false },
  ],
]);

export function contextOf(over: Partial<BasketPricingContext> = {}): BasketPricingContext {
  const route = over.route ?? PICKUP;
  return {
    lines: [PAIN, BOISSON],
    sealing: new Map(),
    known: KNOWN,
    route,
    promotions: {
      at: ASKED_AT,
      live: [TEN_PERCENT_AT_SITE],
      facts: {
        ...PREVIEWED_FACTS,
        fulfillment:
          route.method === "pickup"
            ? { method: "pickup", pickupId: SITE }
            : { method: "delivery", zoneId: route.zoneId },
      },
    },
    replayed: null,
    deliveryVatMode: "standard",
    ...over,
  };
}
