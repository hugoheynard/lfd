import {
  FixedBasketPromotions,
  FixedCompanyStatuses,
  FixedPrincipals,
} from "../../../../promotions/application/__tests__/promotion-supply.doubles.js";
import { PromotionAudienceFactsResolver } from "../../../../promotions/application/promotion-audience-facts.resolver.js";
import { livePromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { PromotionWeeklyHours } from "../../../../promotions/domain/promotion-weekly-hours.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedLineClassifications } from "../../../domain/ports/__tests__/line-classification-doubles.js";
import { BasketPromotions, type BasketPromotionRequest } from "../basket-promotions.service.js";

/**
 * **Une promotion à jours et heures au point panier**
 * (`documentation/promotions/plan-jours-et-heures.md`, § 8) : l'instant jugé
 * est celui de la commande (`now` du `Clock`) ou le créneau choisi ; sans
 * créneau, une promotion « au retrait » ne s'applique pas ; une remise finie
 * aujourd'hui se dit.
 *
 * Les instants sont figés par `FixedClock` : 16 h 30 UTC un lundi de
 * novembre = 17 h 30 à Paris, dans la plage de 17 h à 19 h.
 */

const IN_HOURS = new Date("2026-11-16T16:30:00.000Z");
const AFTER_HOURS = new Date("2026-11-16T18:30:00.000Z");
const FROM = new Date("2026-11-01T00:00:00.000Z");

const EVENING: PromotionWeeklyHours = {
  kind: "weekly_hours",
  moment: "ordered_at",
  announceOutside: false,
  windows: [
    { weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], start: "17:00", end: "19:00" },
  ],
};

const ANTI_GASPI = livePromotion({
  id: "anti_gaspi",
  label: "Anti-gaspi",
  validFrom: FROM,
  effect: { kind: "percent_off", basisPoints: 5000 },
  fulfillment: { kind: "basket", pickup: "all", delivery: "all" },
  conditions: [EVENING],
});

const AT_PICKUP = livePromotion({
  ...ANTI_GASPI,
  label: "Anti-gaspi",
  conditions: [{ ...EVENING, moment: "handover_at" }],
});

function request(handoverAt: BasketPromotionRequest["handoverAt"]): BasketPromotionRequest {
  return {
    lines: [{ sku: "PAI-001", htCents: 1_000, quantity: 2 }],
    buyer: {
      companyId: null,
      companyStatus: null,
      buyerKind: "guest",
      fulfillment: { method: "pickup", pickupId: "pk_coeur" },
    },
    known: null,
    handoverAt,
  };
}

function service(now: Date, promotion = ANTI_GASPI) {
  return new BasketPromotions(
    new FixedBasketPromotions([promotion]),
    new PromotionAudienceFactsResolver(new FixedCompanyStatuses(), new FixedPrincipals()),
    new FixedLineClassifications({}),
    new FixedClock(now),
  );
}

describe("BasketPromotions.resolve — jours et heures", () => {
  it("à la commande, dans la plage : la remise s'applique, rien n'a pris fin", async () => {
    const served = await service(IN_HOURS).resolve(request(null));
    expect(served.discountCents).toBe(500);
    expect(served.promotionId).toBe("anti_gaspi");
    expect(served.ended).toBeUndefined();
  });

  it("à la commande, après la plage : rien, et la fin est dite à 19 h", async () => {
    const served = await service(AFTER_HOURS).resolve(request(null));
    expect(served.discountCents).toBe(0);
    expect(served.ended).toEqual([
      {
        promotionId: "anti_gaspi",
        label: { fr: "Anti-gaspi", en: "Anti-gaspi", it: "Anti-gaspi" },
        endedAt: "19:00",
      },
    ]);
  });

  it("au retrait : le créneau dans la plage l'ouvre, même commandé hors des heures", async () => {
    const served = await service(AFTER_HOURS, AT_PICKUP).resolve(
      request({ day: "2026-11-18", time: "17:30" }),
    );
    expect(served.discountCents).toBe(500);
    // Jugée au créneau : elle ne « finit » pas pendant qu'on regarde le panier.
    expect(served.ended).toBeUndefined();
  });

  it("au retrait : un créneau hors de la plage ne l'ouvre pas, même commandé dedans", async () => {
    const served = await service(IN_HOURS, AT_PICKUP).resolve(
      request({ day: "2026-11-18", time: "08:00" }),
    );
    expect(served.discountCents).toBe(0);
  });

  it("au retrait, sans créneau : elle ne s'applique pas", async () => {
    const served = await service(IN_HOURS, AT_PICKUP).resolve(request(null));
    expect(served.discountCents).toBe(0);
  });
});
