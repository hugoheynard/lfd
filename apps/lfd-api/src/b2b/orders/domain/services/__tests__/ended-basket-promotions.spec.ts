import { admittedPromotion } from "../../../../promotions/domain/__tests__/live-promotion.fixture.js";
import type { PromotionCondition } from "../../../../promotions/domain/promotion-condition.js";
import type { PromotionWeeklyHours } from "../../../../promotions/domain/promotion-weekly-hours.js";
import { endedBasketPromotions } from "../ended-basket-promotions.js";
import { handoverMomentOf } from "../handover-moment.js";

/**
 * **Le panier relu après la fin d'une plage** et **l'instant d'un créneau**
 * (`documentation/promotions/plan-jours-et-heures.md`, § 8). Instants comparés
 * à la seule pendule de la promotion : un lundi de novembre à Paris (UTC+1).
 */

const EVENING: PromotionWeeklyHours = {
  kind: "weekly_hours",
  moment: "ordered_at",
  announceOutside: false,
  windows: [
    { weekdays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], start: "17:00", end: "19:00" },
  ],
};

const LINES = [{ sku: "PAI-001", htCents: 1_000, quantity: 2 }];
const NO_CLASSES = new Map();

function antiGaspi(conditions: readonly PromotionCondition[] = [EVENING]) {
  return admittedPromotion({
    id: "anti_gaspi",
    label: "Anti-gaspi",
    effect: { kind: "percent_off", basisPoints: 5_000 },
    fulfillment: { kind: "basket", pickup: "all", delivery: "none" },
    conditions,
  });
}

describe("endedBasketPromotions", () => {
  it("à 19 h 30, dit que la remise a pris fin à 19 h", () => {
    expect(
      endedBasketPromotions([antiGaspi()], new Date("2026-11-16T18:30:00.000Z"), LINES, NO_CLASSES),
    ).toEqual([
      {
        promotionId: "anti_gaspi",
        label: { fr: "Anti-gaspi", en: "Anti-gaspi", it: "Anti-gaspi" },
        endedAt: "19:00",
      },
    ]);
  });

  it("pendant la plage, ou avant qu'elle ait commencé, rien n'a pris fin", () => {
    for (const iso of ["2026-11-16T16:30:00.000Z", "2026-11-16T08:00:00.000Z"]) {
      expect(endedBasketPromotions([antiGaspi()], new Date(iso), LINES, NO_CLASSES)).toEqual([]);
    }
  });

  it("une remise qui n'aurait pas touché ce panier n'est pas dite", () => {
    const fromTen = antiGaspi([EVENING, { kind: "min_quantity", value: 10 }]);
    expect(
      endedBasketPromotions([fromTen], new Date("2026-11-16T18:30:00.000Z"), LINES, NO_CLASSES),
    ).toEqual([]);
  });

  it("une promotion jugée au créneau ne « finit » pas", () => {
    expect(
      endedBasketPromotions(
        [antiGaspi([{ ...EVENING, moment: "handover_at" }])],
        new Date("2026-11-16T18:30:00.000Z"),
        LINES,
        NO_CLASSES,
      ),
    ).toEqual([]);
  });
});

describe("handoverMomentOf — l'instant d'un créneau", () => {
  it("le début du créneau, sa fin quand il n'a pas de début", () => {
    expect(handoverMomentOf("2026-11-18", { start: "17:00", end: "18:00" })).toEqual({
      day: "2026-11-18",
      time: "17:00",
    });
    expect(handoverMomentOf("2026-11-18", { start: null, end: "10:00" })).toEqual({
      day: "2026-11-18",
      time: "10:00",
    });
  });

  it("sans jour ou sans créneau, aucun instant", () => {
    expect(handoverMomentOf(null, { start: "17:00", end: "18:00" })).toBeNull();
    expect(handoverMomentOf("2026-11-18", null)).toBeNull();
    expect(handoverMomentOf("2026-11-18", undefined)).toBeNull();
  });
});
