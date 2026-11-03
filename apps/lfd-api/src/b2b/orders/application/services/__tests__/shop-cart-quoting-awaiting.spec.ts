import type { ShopQuotePayload } from "@lfd/contracts";

import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { PromotionWeeklyHours } from "../../../../promotions/domain/promotion-weekly-hours.js";
import { catalogItem, PRICED_AT, quotingOf } from "./shop-cart-quoting.doubles.js";

/**
 * **Le panier partiel dit ce qu'il attend** (plan `plan-un-seul-assemblage.md`,
 * § 2.5, lot L2, É3 et É6) : un devis sans acheminement ou sans créneau reste
 * servi, mais `awaiting` dit qu'il n'est pas encore le prix de la commande.
 * Le jour n'est comparé qu'aux heures de la promotion, jamais à l'horloge.
 */
const AT_HANDOVER = livePromotion({
  id: "anti_gaspi",
  label: "Anti-gaspi",
  validFrom: PRICED_AT,
  effect: { kind: "percent_off", basisPoints: 5000 },
  fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
  conditions: [
    {
      kind: "weekly_hours",
      moment: "handover_at",
      announceOutside: false,
      windows: [
        {
          weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          start: "17:00",
          end: "19:00",
        },
      ],
    } satisfies PromotionWeeklyHours,
  ],
});
const LINES: ShopQuotePayload["lines"] = [{ sku: "PAI-001", quantity: 2 }];
const PICKUP = { method: "pickup", pickupAddressId: "pickup_1" } as const;

function quoting(withHourPromotion: boolean) {
  return quotingOf({
    catalog: [catalogItem("PAI-001", "Pain", 500_000, 5.5)],
    basketPromotions: withHourPromotion ? [AT_HANDOVER] : [],
    companyStatus: "active",
  });
}

describe("ShopCartQuoting — ce que le décompte attend encore (L2)", () => {
  it("sans acheminement : servi, sans remise ni frais, et `awaiting` le dit", async () => {
    const { view } = await quoting(false).quote({
      payload: { lines: LINES, fulfillment: null },
      companyId: "co_1",
      buyerUserId: "user_1",
    });
    expect(view).toMatchObject({
      discountCents: 0,
      deliveryFeeCents: 0,
      awaiting: ["fulfillment"],
    });
    expect(view.totalCents).toBeGreaterThan(0);
  });

  it("une promotion « au créneau » sans créneau : `awaiting` demande le créneau", async () => {
    const { view } = await quoting(true).quote({
      payload: { lines: LINES, fulfillment: PICKUP },
      companyId: "co_1",
      buyerUserId: "user_1",
    });
    expect(view.awaiting).toEqual(["window"]);
  });

  it("un panier complet : la clé est absente (contrat servi)", async () => {
    const { view } = await quoting(true).quote({
      payload: {
        lines: LINES,
        fulfillment: PICKUP,
        requestedDeliveryDate: "2026-01-19",
        requestedWindow: { start: "17:30", end: "18:00" },
      },
      companyId: "co_1",
      buyerUserId: "user_1",
    });
    expect(view).not.toHaveProperty("awaiting");
    expect(view.discountCents).toBe(500);
  });

  it("sans promotion à heures, pas de créneau attendu", async () => {
    const { view } = await quoting(false).quote({
      payload: { lines: LINES, fulfillment: PICKUP },
      companyId: null,
      buyerUserId: null,
    });
    expect(view).not.toHaveProperty("awaiting");
  });
});
