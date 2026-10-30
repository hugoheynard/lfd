import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ASKED_AT, livePromotion } from "../../domain/__tests__/live-promotion.fixture.js";
import { PromotionPickupDiscountAnnouncer } from "../promotion-pickup-discount.announcer.js";
import { FixedBasketPromotions, FixedPromotionsSource } from "./promotion-supply.doubles.js";

const AT_COEUR = livePromotion({
  id: "pd_coeur_b2b",
  audience: { kind: "pros_active" },
  fulfillment: { kind: "pickup_point", pickupId: "coeur" },
});

describe("PromotionPickupDiscountAnnouncer", () => {
  it.each(["legacy", "shadow"] as const)(
    "sous %s, ne lit rien et laisse les colonnes du site faire foi",
    async (source) => {
      const promotions = new FixedBasketPromotions([AT_COEUR]);
      const announcer = new PromotionPickupDiscountAnnouncer(
        new FixedPromotionsSource(source),
        promotions,
        new FixedClock(ASKED_AT),
      );

      await expect(announcer.announced(["coeur"])).resolves.toBeNull();
      expect(promotions.reads).toBe(0);
    },
  );

  it("sous promotions, annonce chaque point demandé, en une lecture", async () => {
    const promotions = new FixedBasketPromotions([AT_COEUR]);
    const announcer = new PromotionPickupDiscountAnnouncer(
      new FixedPromotionsSource("promotions"),
      promotions,
      new FixedClock(ASKED_AT),
    );

    const announced = await announcer.announced(["coeur", "autre"]);

    expect(announced?.get("coeur")?.b2b?.adjustment).toEqual({ mode: "percent", bp: 2000 });
    expect(announced?.get("coeur")?.b2c).toBeNull();
    expect(announced?.get("autre")).toEqual({ b2b: null, b2c: null });
    expect(promotions.reads).toBe(1);
  });
});
