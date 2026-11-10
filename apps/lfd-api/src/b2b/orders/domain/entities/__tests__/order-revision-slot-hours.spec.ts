import type { FulfillmentWindow } from "@lfd/contracts";

import type { PromotionWeeklyHours } from "../../../../promotions/domain/promotion-weekly-hours.js";
import { SlotOutsidePromotionHoursError } from "../../errors/fulfillment-promotion-errors.js";
import { Order } from "../order.js";
import type { PricedDraftInput } from "../order-priced-draft.js";
import type { RevisableOrder } from "../order-revision.js";
import { PROMO_A, revisedInput, terms, withActive } from "./order-revision-promotion.fixture.js";

/**
 * **L9, le créneau** (`documentation/promotions/plan-jours-et-heures.md`, § 8.2
 * et § 11) : une remise d'une promotion jugée « au retrait » a été acquise
 * pour le créneau choisi ; changer de jour ou de tranche se juge contre ses
 * heures FIGÉES.
 *
 * La commande de la fixture : mardi 2030-03-12, de 7 h à 8 h, au site A.
 */

const TUESDAY_MORNING: PromotionWeeklyHours = {
  kind: "weekly_hours",
  moment: "handover_at",
  announceOutside: false,
  windows: [{ weekdays: ["tue"], start: "07:00", end: "09:00" }],
};

function orderWith(hours: PromotionWeeklyHours | null) {
  return withActive(PROMO_A, [
    {
      promotionId: "promo_a",
      terms: { ...terms("all", "none"), hours },
      label: "Anti-gaspi du matin",
    },
  ]);
}

function revisedTo(
  order: RevisableOrder,
  window: FulfillmentWindow | null,
  day = "2030-03-12",
): PricedDraftInput {
  const base = revisedInput(order, "site_a");
  return {
    ...base,
    requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
    agreed: { ...base.agreed, window: { value: window, source: "override" } },
  };
}

/** Révise la commande à ces heures-là, en lui changeant de créneau. */
function reviseAt(
  hours: PromotionWeeklyHours | null,
  window: FulfillmentWindow | null,
  day?: string,
) {
  const order = orderWith(hours);
  return Order.revise(order, revisedTo(order, window, day)).revision;
}

describe("Order.revise — le créneau contre les heures figées (L9)", () => {
  it("garde la remise quand le nouveau créneau est dans les heures", () => {
    const revision = reviseAt(TUESDAY_MORNING, { start: "08:00", end: "09:00" });
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("refuse un créneau hors des heures, en nommant la promotion, ses heures et le geste", () => {
    const attempt = () => reviseAt(TUESDAY_MORNING, { start: "10:00", end: "11:00" });
    expect(attempt).toThrow(SlotOutsidePromotionHoursError);
    expect(attempt).toThrow(
      "Ce créneau tombe hors des heures de la promotion « Anti-gaspi du matin » (le mardi de 7 h à 9 h)",
    );
  });

  it("refuse un autre jour, même à la même heure", () => {
    expect(() => reviseAt(TUESDAY_MORNING, { start: "07:00", end: "08:00" }, "2030-03-13")).toThrow(
      SlotOutsidePromotionHoursError,
    );
  });

  it("un créneau sans début se juge à sa fin", () => {
    expect(() => reviseAt(TUESDAY_MORNING, { start: null, end: "08:30" })).not.toThrow();
    expect(() => reviseAt(TUESDAY_MORNING, { start: null, end: "10:00" })).toThrow(
      SlotOutsidePromotionHoursError,
    );
  });

  it("sans créneau, la promotion ne vaut pas : refus", () => {
    expect(() => reviseAt(TUESDAY_MORNING, null)).toThrow(SlotOutsidePromotionHoursError);
  });

  it("une promotion jugée à la commande garde sa remise quel que soit le créneau (Q3)", () => {
    const ordered = { ...TUESDAY_MORNING, moment: "ordered_at" as const };
    expect(() => reviseAt(ordered, { start: "16:00", end: "17:00" }, "2030-03-14")).not.toThrow();
  });

  it("une remise sans heures figées n'a rien à juger sur le créneau", () => {
    expect(() => reviseAt(null, { start: "16:00", end: "17:00" })).not.toThrow();
  });
});
