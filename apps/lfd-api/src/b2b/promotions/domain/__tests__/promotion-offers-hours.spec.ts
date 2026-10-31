import { announcedPickupDiscounts } from "../pickup-discount-announcement.js";
import { fulfillmentOffersFor, offerCandidates, signInOfferFor } from "../promotion-offers.js";
import type { PromotionAudienceFacts } from "../promotion-targeting.js";
import type { PromotionWeeklyHours } from "../promotion-weekly-hours.js";
import { LIVE_FROM, livePromotion } from "./live-promotion.fixture.js";

/**
 * **Le rayon, l'offre de connexion et l'annonce d'un point, pour une promotion
 * à jours et heures** (`documentation/promotions/plan-jours-et-heures.md`, § 8) :
 * active maintenant ; hors de ses heures et montrable, avec ses heures ; hors
 * de ses heures et tue. Jamais présentée comme active hors de ses heures.
 *
 * Instants comparés à la seule pendule de la promotion : un lundi de
 * novembre, 17 h 30 puis 10 h à Paris.
 */

const INSIDE = new Date("2026-11-16T16:30:00.000Z");
const OUTSIDE = new Date("2026-11-16T09:00:00.000Z");

const EVENING: PromotionWeeklyHours = {
  kind: "weekly_hours",
  moment: "ordered_at",
  announceOutside: false,
  windows: [
    { weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], start: "17:00", end: "19:00" },
  ],
};

const ANYONE: PromotionAudienceFacts = {
  companyId: null,
  companyStatus: null,
  principal: { companyId: null },
  buyerKind: "guest",
  fulfillment: null,
};

const PAIN = { sku: "PAIN-1", productId: "prod_pain", categoryPath: ["fam_pains"] };

function antiGaspi(hours: PromotionWeeklyHours, over: Parameters<typeof livePromotion>[0] = {}) {
  return livePromotion({
    id: "anti_gaspi",
    validFrom: LIVE_FROM,
    effect: { kind: "percent_off", basisPoints: 5_000 },
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    conditions: [hours],
    ...over,
  });
}

describe("le rayon — trois cas", () => {
  it("active maintenant : mentionnée, ses heures dites, active", () => {
    const offers = fulfillmentOffersFor(
      offerCandidates([antiGaspi(EVENING)], INSIDE, ANYONE),
      PAIN,
      INSIDE,
    );
    expect(offers).toEqual([
      expect.objectContaining({
        promotionId: "anti_gaspi",
        hours: { moment: "ordered_at", windows: EVENING.windows, activeNow: true },
      }),
    ]);
  });

  it("hors de ses heures, montrable : mentionnée avec ses heures, jamais active", () => {
    const shown = antiGaspi({ ...EVENING, announceOutside: true });
    const offers = fulfillmentOffersFor(offerCandidates([shown], OUTSIDE, ANYONE), PAIN, OUTSIDE);
    expect(offers.map((offer) => offer.hours?.activeNow)).toEqual([false]);
  });

  it("hors de ses heures, tue : rien", () => {
    expect(offerCandidates([antiGaspi(EVENING)], OUTSIDE, ANYONE)).toEqual([]);
    expect(fulfillmentOffersFor([antiGaspi(EVENING)], PAIN, OUTSIDE)).toEqual([]);
  });

  it("jugée au créneau : elle n'est jamais active au rayon, montrable si elle le dit", () => {
    const atPickup = { ...EVENING, moment: "handover_at" as const };
    expect(offerCandidates([antiGaspi(atPickup)], INSIDE, ANYONE)).toEqual([]);
    const shown = antiGaspi({ ...atPickup, announceOutside: true });
    const [offer] = fulfillmentOffersFor([shown], PAIN, INSIDE);
    expect(offer?.hours?.activeNow).toBe(false);
  });
});

describe("l'offre de connexion", () => {
  const registered = (hours: PromotionWeeklyHours) =>
    antiGaspi(hours, { audience: { kind: "individuals_registered" } });
  const line = { article: PAIN, saleUnit: "piece" as const, quantity: 1 };

  it("dit ses heures, active ou montrable ; se tait hors des heures si elle l'a choisi", () => {
    expect(signInOfferFor([registered(EVENING)], INSIDE, [line], null)?.hours?.activeNow).toBe(
      true,
    );
    expect(
      signInOfferFor([registered({ ...EVENING, announceOutside: true })], OUTSIDE, [line], null)
        ?.hours?.activeNow,
    ).toBe(false);
    expect(signInOfferFor([registered(EVENING)], OUTSIDE, [line], null)).toBeUndefined();
  });
});

describe("l'annonce d'un point", () => {
  it("annoncée pendant ses heures seulement, jamais au créneau", () => {
    const promotion = antiGaspi(EVENING, { audience: { kind: "everyone" } });
    expect(announcedPickupDiscounts([promotion], "site", INSIDE).b2c).not.toBeNull();
    expect(announcedPickupDiscounts([promotion], "site", OUTSIDE).b2c).toBeNull();
    const atPickup = antiGaspi({ ...EVENING, moment: "handover_at", announceOutside: true });
    expect(announcedPickupDiscounts([atPickup], "site", INSIDE).b2c).toBeNull();
  });
});
