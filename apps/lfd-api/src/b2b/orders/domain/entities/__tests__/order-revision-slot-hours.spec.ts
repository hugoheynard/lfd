import type { FulfillmentWindow } from "@lfd/contracts";

import type { PromotionWeeklyHours } from "../../../../promotions/domain/promotion-weekly-hours.js";
import { SlotOutsidePromotionHoursError } from "../../errors/fulfillment-promotion-errors.js";
import { Order, type DraftOrderInput } from "../order.js";
import { PROMO_A, input, terms, withActive } from "./order-revision-promotion.fixture.js";

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

function revisedTo(window: FulfillmentWindow | null, day = "2030-03-12"): DraftOrderInput {
  const base = input("site_a", PROMO_A);
  return {
    ...base,
    requestedDeliveryDate: new Date(`${day}T00:00:00.000Z`),
    agreed: { ...base.agreed, window: { value: window, source: "override" } },
  };
}

describe("Order.revise — le créneau contre les heures figées (L9)", () => {
  it("garde la remise quand le nouveau créneau est dans les heures", () => {
    const revision = Order.revise(
      orderWith(TUESDAY_MORNING),
      revisedTo({ start: "08:00", end: "09:00" }),
    );
    expect(revision.state.discountPromotionId).toBe("promo_a");
  });

  it("refuse un créneau hors des heures, en nommant la promotion, ses heures et le geste", () => {
    const attempt = () =>
      Order.revise(orderWith(TUESDAY_MORNING), revisedTo({ start: "10:00", end: "11:00" }));
    expect(attempt).toThrow(SlotOutsidePromotionHoursError);
    expect(attempt).toThrow(
      "Ce créneau tombe hors des heures de la promotion « Anti-gaspi du matin » (le mardi de 7 h à 9 h)",
    );
  });

  it("refuse un autre jour, même à la même heure", () => {
    expect(() =>
      Order.revise(
        orderWith(TUESDAY_MORNING),
        revisedTo({ start: "07:00", end: "08:00" }, "2030-03-13"),
      ),
    ).toThrow(SlotOutsidePromotionHoursError);
  });

  it("un créneau sans début se juge à sa fin", () => {
    expect(() =>
      Order.revise(orderWith(TUESDAY_MORNING), revisedTo({ start: null, end: "08:30" })),
    ).not.toThrow();
    expect(() =>
      Order.revise(orderWith(TUESDAY_MORNING), revisedTo({ start: null, end: "10:00" })),
    ).toThrow(SlotOutsidePromotionHoursError);
  });

  it("sans créneau, la promotion ne vaut pas : refus", () => {
    expect(() => Order.revise(orderWith(TUESDAY_MORNING), revisedTo(null))).toThrow(
      SlotOutsidePromotionHoursError,
    );
  });

  it("une promotion jugée à la commande garde sa remise quel que soit le créneau (Q3)", () => {
    const ordered = { ...TUESDAY_MORNING, moment: "ordered_at" as const };
    expect(() =>
      Order.revise(orderWith(ordered), revisedTo({ start: "16:00", end: "17:00" }, "2030-03-14")),
    ).not.toThrow();
  });

  it("une remise sans heures figées n'a rien à juger sur le créneau", () => {
    expect(() =>
      Order.revise(orderWith(null), revisedTo({ start: "16:00", end: "17:00" })),
    ).not.toThrow();
  });
});
