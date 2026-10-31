import type { FulfillmentWindow, ShopQuotePayload, ShopQuoteView } from "@lfd/contracts";

import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { PromotionWeeklyHours } from "../../../../promotions/domain/promotion-weekly-hours.js";
import { catalogItem, PRICED_AT, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le devis porte le créneau** (décision du 2026-10-31, `promotions.md`,
 * § 2.18) : une promotion jugée « au créneau » se chiffre au panier sur
 * l'instant que la passation jugera — le début du créneau, sa fin s'il n'a pas
 * de début, rien sans créneau.
 *
 * L'horloge est figée par les doubles (`PRICED_AT`) ; le jour demandé n'est
 * comparé qu'aux heures de la promotion, jamais à l'horloge.
 */
const EVENING: PromotionWeeklyHours = {
  kind: "weekly_hours",
  moment: "handover_at",
  announceOutside: false,
  windows: [
    { weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], start: "17:00", end: "19:00" },
  ],
};
const AT_HANDOVER = livePromotion({
  id: "anti_gaspi",
  label: "Anti-gaspi",
  validFrom: PRICED_AT,
  effect: { kind: "percent_off", basisPoints: 5000 },
  fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
  conditions: [EVENING],
});
const DAY = "2026-01-19";
const BASE: ShopQuotePayload = {
  lines: [{ sku: "PAI-001", quantity: 2 }],
  fulfillment: { method: "pickup", pickupAddressId: "pickup_1" },
};

async function quoted(slot: Partial<ShopQuotePayload>): Promise<ShopQuoteView> {
  const { view } = await quotingOf({
    catalog: [catalogItem("PAI-001", "Pain", 500_000, 5.5)],
    basketPromotions: [AT_HANDOVER],
    companyStatus: "active",
  }).quote({ payload: { ...BASE, ...slot }, companyId: "co_1", buyerUserId: "user_1" });
  return view;
}

const window = (start: string | null, end: string): FulfillmentWindow => ({ start, end });

describe("ShopCartQuoting — le créneau choisi juge la promotion « au créneau »", () => {
  it("un créneau dans les heures : la remise est chiffrée", async () => {
    const view = await quoted({
      requestedDeliveryDate: DAY,
      requestedWindow: window("17:30", "18:00"),
    });
    expect(view.discountCents).toBe(500);
  });

  it("un créneau hors des heures : pas de remise", async () => {
    const view = await quoted({
      requestedDeliveryDate: DAY,
      requestedWindow: window("09:00", "10:00"),
    });
    expect(view.discountCents).toBe(0);
  });

  it("un créneau sans début : sa fin est jugée", async () => {
    const inside = await quoted({
      requestedDeliveryDate: DAY,
      requestedWindow: window(null, "18:00"),
    });
    const outside = await quoted({
      requestedDeliveryDate: DAY,
      requestedWindow: window(null, "10:00"),
    });
    expect([inside.discountCents, outside.discountCents]).toEqual([500, 0]);
  });

  it("sans créneau, ou un jour sans créneau : le devis d'avant, sans remise", async () => {
    const none = await quoted({});
    const dayOnly = await quoted({ requestedDeliveryDate: DAY, requestedWindow: null });
    expect([none.discountCents, dayOnly.discountCents]).toEqual([0, 0]);
  });
});
