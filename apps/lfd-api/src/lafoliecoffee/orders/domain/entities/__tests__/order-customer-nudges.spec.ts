import { OrderCustomerNudges, type OrderCustomerNudgesSnapshot } from "../order-customer-nudges.js";
import {
  DelayWarningAlreadySentError,
  DelayWarningRefusedError,
  DelayWarningTooEarlyError,
  PickupReminderAlreadySentError,
  PickupReminderTooEarlyError,
} from "../../errors/customer-nudge-errors.js";
import { ReminderRefusedError } from "../../errors/order-errors.js";

/*
 * Les instants ne sont comparés qu'entre eux — la fin du créneau de la
 * fixture et l'instant du geste —, jamais à l'horloge : ils peuvent rester
 * absolus (CLAUDE.md §5). Le créneau finit à 10:00 à Paris, soit 08:00 UTC
 * en septembre.
 */
const SLOT_END = new Date("2026-09-11T08:00:00.000Z");
const minutesAfterEnd = (minutes: number): Date => new Date(SLOT_END.getTime() + minutes * 60_000);

function nudges(over: Partial<OrderCustomerNudgesSnapshot> = {}): OrderCustomerNudges {
  return OrderCustomerNudges.fromSnapshot({
    orderId: "order_1",
    reference: "ORD-4812",
    fulfillmentMethod: "pickup",
    status: "ready",
    readyAt: new Date("2026-09-11T05:00:00.000Z"),
    handedOverAt: null,
    serviceDay: "2026-09-11",
    windowEnd: "10:00",
    pickupReminder: null,
    delayWarning: null,
    ...over,
  });
}

const NOT_READY = { status: "confirmed", readyAt: null } as const;

describe("« Rappel au client »", () => {
  it("se trace sur une commande prête, passé le délai après la fin du créneau", () => {
    const subject = nudges();

    subject.remindPickup(minutesAfterEnd(15), "staff_karim", 15);

    expect(subject.toSnapshot().pickupReminder).toEqual({
      at: minutesAfterEnd(15),
      byStaffId: "staff_karim",
    });
    expect(subject.toSnapshot().delayWarning).toBeNull();
  });

  it("🔴 est refusé avant la fin du délai — l'heure du refus est celle du réglage", () => {
    const subject = nudges();

    expect(() => subject.remindPickup(minutesAfterEnd(14), "staff_karim", 15)).toThrow(
      PickupReminderTooEarlyError,
    );
    expect(() => subject.remindPickup(minutesAfterEnd(14), "staff_karim", 15)).toThrow(/10:15/u);
    expect(subject.toSnapshot().pickupReminder).toBeNull();
  });

  it("à 0 minute, part dès la fin du créneau, pas avant", () => {
    expect(() => nudges().remindPickup(minutesAfterEnd(-1), "s", 0)).toThrow(
      PickupReminderTooEarlyError,
    );
    expect(() => nudges().remindPickup(minutesAfterEnd(0), "s", 0)).not.toThrow();
  });

  it("🔴 ne part qu'UNE fois par commande", () => {
    const subject = nudges({
      pickupReminder: { at: minutesAfterEnd(5), byStaffId: "staff_lea" },
    });

    expect(() => subject.remindPickup(minutesAfterEnd(30), "staff_karim", 0)).toThrow(
      PickupReminderAlreadySentError,
    );
    expect(subject.toSnapshot().pickupReminder?.byStaffId).toBe("staff_lea");
  });

  it("🔴 est refusé sur une commande pas prête : c'est « Avertir le client »", () => {
    expect(() => nudges(NOT_READY).remindPickup(minutesAfterEnd(30), "s", 0)).toThrow(
      /Avertir le client/u,
    );
  });

  it.each([
    ["une livraison", { fulfillmentMethod: "delivery" }],
    ["une annulée", { status: "cancelled" }],
    ["une retirée", { status: "fulfilled" }],
    ["une retirée dont le statut n'a pas suivi", { handedOverAt: minutesAfterEnd(1) }],
    ["un brouillon", { status: "draft" }],
    ["sans créneau lisible", { windowEnd: null }],
  ] as const)("est refusé sur %s", (_case, over) => {
    expect(() => nudges(over).remindPickup(minutesAfterEnd(30), "s", 0)).toThrow(
      ReminderRefusedError,
    );
  });
});

describe("« Avertir le client »", () => {
  it("se trace sur une commande PAS prête, passé le délai après la fin du créneau", () => {
    const subject = nudges(NOT_READY);

    subject.warnDelay(minutesAfterEnd(10), "staff_lea", 10);

    expect(subject.toSnapshot().delayWarning).toEqual({
      at: minutesAfterEnd(10),
      byStaffId: "staff_lea",
    });
    expect(subject.toSnapshot().pickupReminder).toBeNull();
  });

  it("🔴 est refusé avant la fin du délai", () => {
    expect(() => nudges(NOT_READY).warnDelay(minutesAfterEnd(9), "s", 10)).toThrow(
      DelayWarningTooEarlyError,
    );
  });

  it("🔴 ne part qu'UNE fois par commande", () => {
    const subject = nudges({
      ...NOT_READY,
      delayWarning: { at: minutesAfterEnd(1), byStaffId: "staff_lea" },
    });

    expect(() => subject.warnDelay(minutesAfterEnd(30), "s", 0)).toThrow(
      DelayWarningAlreadySentError,
    );
  });

  it("🔴 est refusé sur une commande prête : c'est « Rappel au client »", () => {
    expect(() => nudges().warnDelay(minutesAfterEnd(30), "s", 0)).toThrow(/Rappel au client/u);
    // Prête par son statut seul, sans instant : prête quand même.
    expect(() => nudges({ readyAt: null }).warnDelay(minutesAfterEnd(30), "s", 0)).toThrow(
      DelayWarningRefusedError,
    );
  });

  it.each([
    ["une livraison", { fulfillmentMethod: "delivery" }],
    ["une annulée", { status: "cancelled" }],
    ["sans créneau lisible", { serviceDay: null }],
  ] as const)("est refusé sur %s", (_case, over) => {
    expect(() => nudges({ ...NOT_READY, ...over }).warnDelay(minutesAfterEnd(30), "s", 0)).toThrow(
      DelayWarningRefusedError,
    );
  });

  it("un avertissement n'empêche pas le rappel, une fois la commande prête", () => {
    const subject = nudges({ delayWarning: { at: minutesAfterEnd(1), byStaffId: "staff_lea" } });

    subject.remindPickup(minutesAfterEnd(60), "staff_karim", 0);

    expect(subject.toSnapshot().delayWarning?.byStaffId).toBe("staff_lea");
    expect(subject.toSnapshot().pickupReminder?.byStaffId).toBe("staff_karim");
  });
});
