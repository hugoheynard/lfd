import { BasketPromotionsWouldCombineError } from "../errors/promotion-errors.js";
import { describePromotion } from "../promotion-act.js";
import { assertSingleBasketPromotion, type PromotionRival } from "../promotion-overlap.js";
import type { PromotionHoursWindow, PromotionWeeklyHours } from "../promotion-weekly-hours.js";
import { basketTerms } from "./promotion-terms.fixture.js";

/**
 * **Le recouvrement de deux promotions à heures** et la phrase du journal
 * (`documentation/promotions/plan-jours-et-heures.md`, § 4 et § 8).
 */

const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function hours(
  window: PromotionHoursWindow,
  moment: PromotionWeeklyHours["moment"] = "ordered_at",
): PromotionWeeklyHours {
  return { kind: "weekly_hours", moment, announceOutside: false, windows: [window] };
}

const MORNING = hours({ weekdays: EVERY_DAY, start: "07:00", end: "09:00" });
const EVENING = hours({ weekdays: EVERY_DAY, start: "17:00", end: "19:00" });

const rival = (id: string, conditions: PromotionRival["terms"]["conditions"]): PromotionRival => ({
  id,
  terms: basketTerms({ internalName: id, conditions }),
});

describe("assertSingleBasketPromotion — jours et heures", () => {
  it("deux non cumulables aux plages disjointes ne se recouvrent pas", () => {
    expect(() =>
      assertSingleBasketPromotion(rival("soir", [EVENING]), [rival("matin", [MORNING])]),
    ).not.toThrow();
  });

  it("aux plages qui se croisent, si", () => {
    const late = hours({ weekdays: ["mon"], start: "18:00", end: "20:00" });
    expect(() =>
      assertSingleBasketPromotion(rival("soir", [EVENING]), [rival("tard", [late])]),
    ).toThrow(BasketPromotionsWouldCombineError);
  });

  it("de moments différents, dès que leurs jours se croisent", () => {
    const pickupMorning = hours({ weekdays: ["mon"], start: "07:00", end: "09:00" }, "handover_at");
    expect(() =>
      assertSingleBasketPromotion(rival("soir", [EVENING]), [rival("retrait", [pickupMorning])]),
    ).toThrow(BasketPromotionsWouldCombineError);
  });

  it("une promotion sans heures recouvre toujours une promotion à heures", () => {
    expect(() =>
      assertSingleBasketPromotion(rival("soir", [EVENING]), [rival("toujours", [])]),
    ).toThrow(BasketPromotionsWouldCombineError);
  });
});

describe("le journal", () => {
  it("dit les jours et heures, et rien quand il n'y en a pas", () => {
    expect(describePromotion(basketTerms({ conditions: [EVENING] }))).toContain(
      "commandé tous les jours de 17 h à 19 h",
    );
    expect(describePromotion(basketTerms())).not.toContain(" h ");
  });
});
