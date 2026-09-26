import { localToInstant, type OrderCutoffView } from "@lfd/contracts";

import { isSettlementReminderDue, settlementReminderDay } from "../settlement-reminder.js";

/**
 * Les dates ne sont comparées qu'entre elles — la journée et un `now` construit
 * à partir d'elle — jamais à l'horloge (CLAUDE.md §5, l'exception étroite).
 */
const DAY = "2030-03-12";
const EVE = "2030-03-11";

const rule = (over: Partial<OrderCutoffView> = {}): OrderCutoffView => ({
  id: "cut_1",
  pickupAddressId: null,
  pickupLabel: null,
  weekday: null,
  daysBefore: 1,
  time: "18:00",
  graceMinutes: 0,
  ...over,
});

function at(day: string, time: string): Date {
  const instant = localToInstant(day, time);
  if (instant === null) {
    throw new TypeError(`heure inexistante : ${day} ${time}`);
  }
  return instant;
}

describe("isSettlementReminderDue", () => {
  it("se tait avant l'heure limite, et à la seconde même de la limite", () => {
    expect(isSettlementReminderDue([rule()], DAY, at(EVE, "17:59"))).toBe(false);
    expect(isSettlementReminderDue([rule()], DAY, at(EVE, "18:00"))).toBe(false);
  });

  it("sonne dès que la limite est passée, grâce comprise", () => {
    expect(isSettlementReminderDue([rule()], DAY, at(EVE, "18:01"))).toBe(true);
    expect(isSettlementReminderDue([rule({ graceMinutes: 60 })], DAY, at(EVE, "18:30"))).toBe(true);
  });

  it("lit la limite à l'heure de Paris, pas en UTC", () => {
    // 18 h à Paris en mars = 17 h UTC : à 17 h 30 UTC, c'est passé.
    expect(isSettlementReminderDue([rule()], DAY, new Date(`${EVE}T17:30:00.000Z`))).toBe(true);
    expect(isSettlementReminderDue([rule()], DAY, new Date(`${EVE}T16:30:00.000Z`))).toBe(false);
  });

  it("se tait sans règle : aucun « trop tard » à annoncer", () => {
    expect(isSettlementReminderDue([], DAY, at(DAY, "23:00"))).toBe(false);
  });

  it("oppose la règle par défaut de la journée, jamais celle d'un point de retrait", () => {
    const pointOnly = rule({ pickupAddressId: "pickup_1", daysBefore: 3 });

    expect(isSettlementReminderDue([pointOnly], DAY, at(EVE, "12:00"))).toBe(false);
  });
});

describe("settlementReminderDay", () => {
  it("prend le jour de retrait quand il y en a un", () => {
    expect(settlementReminderDay({ serviceDay: DAY, placedAt: at(EVE, "09:00") })).toBe(DAY);
  });

  it("sans jour de retrait, rattache au jour de passation À PARIS (Q5, S6)", () => {
    // 23 h 30 UTC le 11 mars = 00 h 30 le 12 à Paris.
    const placedAt = new Date(`${EVE}T23:30:00.000Z`);

    expect(settlementReminderDay({ serviceDay: null, placedAt })).toBe(DAY);
  });
});
