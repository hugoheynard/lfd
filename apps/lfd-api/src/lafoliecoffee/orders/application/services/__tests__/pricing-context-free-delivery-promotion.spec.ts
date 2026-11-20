import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { LivePromotion } from "../../../../promotions/domain/live-promotion.js";
import { priceBasket } from "../../../domain/services/price-basket.js";
import type { OrderContent } from "../order-content.js";
import { loadedOrRefused, type PricingRequest } from "../pricing-context.service.js";
import { LABO, pricingContextOf, ZONE } from "./pricing-context.doubles.js";
import { PRICED_AT } from "./shop-cart-quoting.doubles.js";

/**
 * **Les promotions « Sur la livraison » au chargement du chiffrage**
 * (`plan-livraison-offerte.md`, § 2.4, § 2.8) : lues pour les faits du CLIENT
 * — quand l'équipe commande pour lui comme quand il commande —, dans la zone
 * livrée, et rejugées en révision : une promotion finie n'offre plus.
 */
const DAY_MS = 86_400_000;

const CONTENT: OrderContent = {
  fulfillmentMethod: "delivery",
  deliveryAddress: { ...LABO, label: "" },
  deliveryAddressId: null,
  pickupAddressId: null,
  requestedDeliveryDate: null,
  note: "",
  lines: [{ sku: "PAI-001", quantity: 2 }],
};

/** L'équipe commande pour la société `co_1`. */
const BY_STAFF_FOR_CLIENT: PricingRequest = {
  content: CONTENT,
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
};

/** « Livraison offerte » à `companyId`, toujours, depuis la veille du chiffrage. */
function offeredTo(
  companyId: string,
  over: Partial<Pick<LivePromotion, "validTo" | "suspendedFrom" | "fulfillment">> = {},
): LivePromotion {
  return livePromotion({
    id: "promo_livraison",
    label: "Client fidèle",
    effect: { kind: "free_delivery" },
    audience: { kind: "company", companyId },
    fulfillment: { kind: "delivery_fee", delivery: { zones: [ZONE.id] } },
    validFrom: new Date(PRICED_AT.getTime() - DAY_MS),
    ...over,
  });
}

async function pricedFor(promotions: readonly LivePromotion[], over: Partial<PricingRequest> = {}) {
  const { loader } = pricingContextOf({
    deliveryFeePromotions: promotions,
    companyStatus: "active",
  });
  const { context } = loadedOrRefused(await loader.load({ ...BY_STAFF_FOR_CLIENT, ...over }));
  return {
    context,
    amounts: priceBasket(context, { vatMethod: "line_ht", handoverAt: null }, { lateFee: null }),
  };
}

describe("PricingContext — la livraison offerte par une promotion", () => {
  it("le staff qui commande pour une société : les faits de la SOCIÉTÉ, dans la zone livrée", async () => {
    const { context, amounts } = await pricedFor([offeredTo("co_1")]);

    if (context.route.method !== "delivery") {
      throw new TypeError("une livraison était attendue");
    }
    expect(context.route.deliveryFeePromotions?.facts).toMatchObject({
      companyId: "co_1",
      fulfillment: { method: "delivery", zoneId: ZONE.id },
    });
    expect(amounts.terms.deliveryFeeCents).toBe(0);
    expect(amounts.terms.freeDelivery?.promotion?.promotionId).toBe("promo_livraison");
  });

  it("la promotion d'une autre société n'offre rien au client", async () => {
    const { amounts } = await pricedFor([offeredTo("co_autre")]);

    expect(amounts.terms.freeDelivery).toBeNull();
    expect(amounts.terms.deliveryFeeCents).toBeGreaterThan(0);
  });

  it("une promotion qui vise une autre zone n'offre rien", async () => {
    const elsewhere = offeredTo("co_1", {
      fulfillment: { kind: "delivery_fee", delivery: { zones: ["zone_ailleurs"] } },
    });
    const { amounts } = await pricedFor([elsewhere]);

    expect(amounts.terms.freeDelivery).toBeNull();
  });

  describe("la révision rejuge la promotion (§ 2.8, B3)", () => {
    const REVISED: Partial<PricingRequest> = {
      revised: { lines: [], discounts: [] },
      frozenDeliveryFee: { zoneId: ZONE.id, fee: ZONE.fee, freeDeliveryThresholdCents: null },
    };

    it("toujours vivante et éligible : toujours offerte", async () => {
      const { amounts } = await pricedFor([offeredTo("co_1")], REVISED);

      expect(amounts.terms.freeDelivery?.promotion?.promotionId).toBe("promo_livraison");
    });

    it.each([
      ["finie depuis", { validTo: new Date(PRICED_AT.getTime() - 1) }],
      ["suspendue depuis", { suspendedFrom: new Date(PRICED_AT.getTime() - 1) }],
    ])("%s : le frais revient", async (_case, over) => {
      const { amounts } = await pricedFor([offeredTo("co_1", over)], REVISED);

      expect(amounts.terms.freeDelivery).toBeNull();
      expect(amounts.terms.deliveryFeeCents).toBeGreaterThan(0);
    });

    it("archivée (absente des vivantes) : le frais revient", async () => {
      const { amounts } = await pricedFor([], REVISED);

      expect(amounts.terms.freeDelivery).toBeNull();
    });
  });
});
