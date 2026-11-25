import type { DeliveryPricingTerms } from "@lfd/contracts";

import type { OrderContent } from "../order-content.js";
import { loadedOrRefused, type PricingRequest } from "../pricing-context.service.js";
import { LABO, pricingContextOf, ZONE } from "./pricing-context.doubles.js";

/**
 * **Le port offert, au chargement** (plan
 * `documentation/commandes/reliquat/plan-reliquat-de-commande.md`,
 * décisions 7 et 14) : `offeredDelivery` remplace le seuil du franco de la
 * route par 0, à la passation comme en révision, dans la zone figée comme
 * dans une autre. Le barème, lui, reste lu : `priceBasket` fige ce qui a été
 * offert.
 */

const DELIVERED: OrderContent = {
  fulfillmentMethod: "delivery",
  deliveryAddress: { ...LABO, label: "" },
  deliveryAddressId: null,
  pickupAddressId: null,
  requestedDeliveryDate: null,
  note: "",
  lines: [{ sku: "PAI-001", quantity: 2 }],
};

/** Un franco de 80 € HT pour les pros, réglé globalement. */
const FRANCO: DeliveryPricingTerms = {
  b2b: { fee: { mode: "amount", cents: 500 }, freeDeliveryThresholdCents: 8_000 },
  b2c: { fee: { mode: "amount", cents: 1_200 }, freeDeliveryThresholdCents: 8_000 },
};

function request(over: Partial<PricingRequest> = {}): PricingRequest {
  return {
    content: DELIVERED,
    parties: {
      companyId: "co_1",
      placedByUserId: "user_client",
      placedByStaffId: "staff_1",
      buyerKind: "registered",
      exceedItemLimits: false,
    },
    revised: null,
    caller: "checkout",
    vatMethod: "line_ht",
    frozenDeliveryVatMode: null,
    frozenAudience: null,
    frozenDeliveryFee: null,
    offeredDelivery: false,
    negotiated: { payerCompanyId: "co_1", day: null },
    ...over,
  };
}

async function routeOf(over: Partial<PricingRequest>, pricing: DeliveryPricingTerms = FRANCO) {
  const { loader } = pricingContextOf({ deliveryPricing: pricing, companyStatus: "active" });
  const { context } = loadedOrRefused(await loader.load(request(over)));
  if (context.route.method !== "delivery") {
    throw new TypeError("une livraison était attendue");
  }
  return context.route;
}

describe("PricingContext — le port offert met le seuil du franco à 0", () => {
  it("une passation ordinaire garde le seuil de la route", async () => {
    const route = await routeOf({});

    expect(route.freeDeliveryThresholdCents).toBe(8_000);
    expect(route.fee).toEqual({ mode: "amount", cents: 500 });
  });

  it("le port offert : seuil 0, barème de la zone toujours lu", async () => {
    const route = await routeOf({ offeredDelivery: true });

    expect(route.freeDeliveryThresholdCents).toBe(0);
    expect(route.fee).toEqual({ mode: "amount", cents: 500 });
  });

  it("en révision dans la zone figée : seuil 0, même si un seuil figé existe", async () => {
    const route = await routeOf({
      revised: { lines: [], discounts: [] },
      frozenDeliveryFee: {
        zoneId: ZONE.id,
        fee: { mode: "amount", cents: 300 },
        freeDeliveryThresholdCents: 6_000,
      },
      offeredDelivery: true,
    });

    expect(route.freeDeliveryThresholdCents).toBe(0);
    expect(route.fee).toEqual({ mode: "amount", cents: 300 });
  });

  it("en révision vers une AUTRE zone : le barème du jour, et toujours le seuil 0 (décision 14)", async () => {
    const route = await routeOf({
      revised: { lines: [], discounts: [] },
      frozenDeliveryFee: {
        zoneId: "zone_ailleurs",
        fee: { mode: "amount", cents: 300 },
        freeDeliveryThresholdCents: 6_000,
      },
      offeredDelivery: true,
    });

    expect(route.freeDeliveryThresholdCents).toBe(0);
    expect(route.fee).toEqual({ mode: "amount", cents: 500 });
  });

  // Sans franco, la route a un seuil nul : « jamais offert ». Le port offert
  // doit le remplacer quand même, sinon le premier reliquat livré dans une
  // telle zone paierait son port.
  describe("zone sans franco", () => {
    const NO_FRANCO: DeliveryPricingTerms = {
      b2b: { fee: { mode: "amount", cents: 500 }, freeDeliveryThresholdCents: null },
      b2c: { fee: { mode: "amount", cents: 1_200 }, freeDeliveryThresholdCents: null },
    };

    it("ordinaire : aucun seuil, le port se facture", async () => {
      const route = await routeOf({}, NO_FRANCO);

      expect(route.freeDeliveryThresholdCents).toBeNull();
    });

    it("port offert : le seuil vaut 0 quand même", async () => {
      const route = await routeOf({ offeredDelivery: true }, NO_FRANCO);

      expect(route.freeDeliveryThresholdCents).toBe(0);
    });

    it("en révision, tarif figé sans seuil, même zone : le seuil vaut 0", async () => {
      const route = await routeOf(
        {
          revised: { lines: [], discounts: [] },
          frozenDeliveryFee: {
            zoneId: ZONE.id,
            fee: { mode: "amount", cents: 300 },
            freeDeliveryThresholdCents: null,
          },
          offeredDelivery: true,
        },
        NO_FRANCO,
      );

      expect(route.freeDeliveryThresholdCents).toBe(0);
    });
  });

  it("une zone à frais en % garde son barème, seul le seuil change", async () => {
    const percent: DeliveryPricingTerms = {
      b2b: { fee: { mode: "percent", bp: 1_000 }, freeDeliveryThresholdCents: 8_000 },
      b2c: { fee: { mode: "percent", bp: 1_000 }, freeDeliveryThresholdCents: 8_000 },
    };
    const route = await routeOf({ offeredDelivery: true }, percent);

    expect(route.fee).toEqual({ mode: "percent", bp: 1_000 });
    expect(route.freeDeliveryThresholdCents).toBe(0);
  });

  // Rien à offrir en retrait : le drapeau ne fabrique ni route livrée ni seuil.
  it("en retrait, le drapeau ne change pas l'acheminement", async () => {
    const { loader } = pricingContextOf({ deliveryPricing: FRANCO, companyStatus: "active" });
    const pickup: OrderContent = {
      ...DELIVERED,
      fulfillmentMethod: "pickup",
      deliveryAddress: null,
      pickupAddressId: LABO.id,
    };
    const { context } = loadedOrRefused(
      await loader.load(request({ content: pickup, offeredDelivery: true })),
    );

    expect(context.route.method).toBe("pickup");
  });
});
