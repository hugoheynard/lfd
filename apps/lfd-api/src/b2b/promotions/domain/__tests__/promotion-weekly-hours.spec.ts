import { PromotionHoursAtDisplayedPriceError } from "../errors/promotion-hours-errors.js";
import { PromotionInvalidHoursError } from "../errors/promotion-hours-errors.js";
import { assertConditions } from "../promotion-condition.js";
import { assertTerms } from "../promotion-terms.js";
import {
  assertWeeklyHours,
  describeWeeklyHours,
  weeklyHoursAdmit,
  weeklyHoursEndedAt,
  weeklyHoursMeet,
  weeklyHoursStanding,
  type PromotionHoursWindow,
  type PromotionWeeklyHours,
} from "../promotion-weekly-hours.js";
import { basketTerms, lineTerms } from "./promotion-terms.fixture.js";

/**
 * Les jours et heures d'une promotion (`documentation/promotions/plan-jours-et-heures.md`).
 *
 * Les dates absolues sont le SUJET : un instant comparé à une pendule de la
 * semaine, et les deux bascules d'heure — jamais à l'horloge du test.
 */

const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function hours(
  windows: readonly PromotionHoursWindow[],
  over: Partial<Omit<PromotionWeeklyHours, "kind" | "windows">> = {},
): PromotionWeeklyHours {
  return { kind: "weekly_hours", moment: "ordered_at", announceOutside: false, windows, ...over };
}

const EVENING = hours([{ weekdays: EVERY_DAY, start: "17:00", end: "19:00" }]);
const at = (iso: string) => ({ orderedAt: new Date(iso), handoverAt: null });

function faultOf(run: () => void): string | null {
  try {
    run();
    return null;
  } catch (error) {
    return error instanceof PromotionInvalidHoursError ? error.fault : "autre";
  }
}

describe("assertWeeklyHours — les refus de la pose", () => {
  it.each([
    ["aucune plage", hours([]), "no_window"],
    ["aucun jour", hours([{ weekdays: [], start: "17:00", end: "19:00" }]), "no_weekday"],
    [
      "un jour deux fois dans une plage",
      hours([{ weekdays: ["mon", "mon"], start: "17:00", end: "19:00" }]),
      "duplicate_weekday",
    ],
    [
      "heure mal formée",
      hours([{ weekdays: ["mon"], start: "7h", end: "19:00" }]),
      "malformed_hour",
    ],
    [
      "heure hors cadran",
      hours([{ weekdays: ["mon"], start: "17:00", end: "25:00" }]),
      "malformed_hour",
    ],
    [
      "fin égale au début",
      hours([{ weekdays: ["mon"], start: "17:00", end: "17:00" }]),
      "reversed",
    ],
    [
      "plage qui passe minuit",
      hours([{ weekdays: ["fri"], start: "22:00", end: "02:00" }]),
      "reversed",
    ],
    [
      "deux plages qui se chevauchent un même jour",
      hours([
        { weekdays: ["mon", "tue"], start: "07:00", end: "10:00" },
        { weekdays: ["tue"], start: "09:00", end: "11:00" },
      ]),
      "overlap",
    ],
  ])("%s", (_case, condition, fault) => {
    expect(faultOf(() => assertWeeklyHours(condition))).toBe(fault);
  });

  it("un jour figure dans plusieurs plages disjointes, et une plage finit à minuit", () => {
    expect(() =>
      assertWeeklyHours(
        hours([
          { weekdays: ["mon", "tue", "wed", "thu", "fri"], start: "07:00", end: "09:00" },
          { weekdays: ["mon", "tue", "wed", "thu", "fri"], start: "17:00", end: "19:00" },
          { weekdays: ["sat"], start: "22:00", end: "24:00" },
        ]),
      ),
    ).not.toThrow();
  });

  it("deux plages bout à bout ne se chevauchent pas (fin exclue)", () => {
    expect(() =>
      assertWeeklyHours(
        hours([
          { weekdays: ["mon"], start: "07:00", end: "09:00" },
          { weekdays: ["mon"], start: "09:00", end: "11:00" },
        ]),
      ),
    ).not.toThrow();
  });

  it("refuse deux conditions « jours et heures » sur une même promotion", () => {
    expect(faultOf(() => assertConditions([EVENING, EVENING]))).toBe("repeated");
  });

  it("une promotion à heures est une remise au panier : refusée « dans le prix affiché »", () => {
    expect(() => assertTerms(lineTerms({ conditions: [EVENING] }))).toThrow(
      PromotionHoursAtDisplayedPriceError,
    );
    expect(() =>
      assertTerms(lineTerms({ conditions: [{ ...EVENING, moment: "handover_at" }] })),
    ).toThrow(PromotionHoursAtDisplayedPriceError);
    expect(() => assertTerms(basketTerms({ conditions: [EVENING] }))).not.toThrow();
  });

  it("le message nomme la plage et le geste de sortie", () => {
    expect(() =>
      assertWeeklyHours(hours([{ weekdays: ["fri"], start: "22:00", end: "02:00" }])),
    ).toThrow(/de 22 h à 2 h.*découpez-la en deux/u);
  });
});

describe("weeklyHoursAdmit — l'instant jugé", () => {
  it("à la commande : début compris, fin exclue, à l'heure de Paris", () => {
    // 2026-11-16 est un lundi ; Paris = UTC+1 en novembre.
    expect(weeklyHoursAdmit(EVENING, at("2026-11-16T15:59:00.000Z"))).toBe(false);
    expect(weeklyHoursAdmit(EVENING, at("2026-11-16T16:00:00.000Z"))).toBe(true);
    expect(weeklyHoursAdmit(EVENING, at("2026-11-16T17:59:00.000Z"))).toBe(true);
    expect(weeklyHoursAdmit(EVENING, at("2026-11-16T18:00:00.000Z"))).toBe(false);
  });

  it("le jour est celui de Paris, pas celui d'UTC", () => {
    const tuesday = hours([{ weekdays: ["tue"], start: "00:00", end: "01:00" }]);
    // Lundi 23 h 30 UTC = mardi 0 h 30 à Paris.
    expect(weeklyHoursAdmit(tuesday, at("2026-11-16T23:30:00.000Z"))).toBe(true);
  });

  it("au retrait : le créneau choisi, et rien sans créneau", () => {
    const pickup = { ...EVENING, moment: "handover_at" as const };
    const orderedOutside = new Date("2026-11-16T08:00:00.000Z");
    expect(
      weeklyHoursAdmit(pickup, {
        orderedAt: orderedOutside,
        handoverAt: { day: "2026-11-18", time: "17:30" },
      }),
    ).toBe(true);
    expect(
      weeklyHoursAdmit(pickup, {
        orderedAt: new Date("2026-11-16T16:30:00.000Z"),
        handoverAt: { day: "2026-11-18", time: "08:00" },
      }),
    ).toBe(false);
    expect(weeklyHoursAdmit(pickup, { orderedAt: orderedOutside, handoverAt: null })).toBe(false);
  });
});

describe("heure murale aux bascules", () => {
  const nightOfSunday = hours([{ weekdays: ["sun"], start: "02:00", end: "03:00" }]);

  it("fin mars : la plage de 2 h à 3 h n'existe pas", () => {
    // 2027-03-28, dernier dimanche de mars : 01:59 CET puis 03:00 CEST.
    for (const iso of [
      "2027-03-28T00:30:00.000Z",
      "2027-03-28T00:59:00.000Z",
      "2027-03-28T01:00:00.000Z",
    ]) {
      expect(weeklyHoursAdmit(nightOfSunday, at(iso))).toBe(false);
    }
  });

  it("fin octobre : la plage de 2 h à 3 h vaut deux fois", () => {
    // 2026-10-25, dernier dimanche d'octobre : 2 h 30 CEST puis 2 h 30 CET.
    expect(weeklyHoursAdmit(nightOfSunday, at("2026-10-25T00:30:00.000Z"))).toBe(true);
    expect(weeklyHoursAdmit(nightOfSunday, at("2026-10-25T01:30:00.000Z"))).toBe(true);
  });

  it("de 17 h à 19 h à la pendule, avant comme après la bascule de mars", () => {
    // Samedi 28 mars 2026 (UTC+1) puis dimanche 29 (UTC+2) : même instant UTC, autre heure murale.
    expect(weeklyHoursAdmit(EVENING, at("2026-03-28T17:30:00.000Z"))).toBe(true);
    expect(weeklyHoursAdmit(EVENING, at("2026-03-29T17:30:00.000Z"))).toBe(false);
    expect(weeklyHoursAdmit(EVENING, at("2026-03-29T15:30:00.000Z"))).toBe(true);
  });
});

describe("weeklyHoursMeet — le recouvrement", () => {
  const morning = hours([{ weekdays: EVERY_DAY, start: "07:00", end: "09:00" }]);

  it("même instant jugé : seules les plages qui se croisent", () => {
    expect(weeklyHoursMeet(morning, EVENING)).toBe(false);
    expect(
      weeklyHoursMeet(EVENING, hours([{ weekdays: ["mon"], start: "18:00", end: "20:00" }])),
    ).toBe(true);
  });

  it("instants différents : dès que les jours se croisent", () => {
    expect(weeklyHoursMeet(morning, { ...EVENING, moment: "handover_at" })).toBe(true);
    const tuesday = hours([{ weekdays: ["tue"], start: "07:00", end: "09:00" }]);
    const thursday = hours([{ weekdays: ["thu"], start: "17:00", end: "19:00" }], {
      moment: "handover_at",
    });
    expect(weeklyHoursMeet(tuesday, thursday)).toBe(false);
  });

  it("sans heures d'un côté, elles se rencontrent toujours", () => {
    expect(weeklyHoursMeet(null, EVENING)).toBe(true);
  });
});

describe("annonce et fin", () => {
  it("active pendant ses heures ; hors heures, dite ou tue selon la promotion", () => {
    const inside = new Date("2026-11-16T16:30:00.000Z");
    const outside = new Date("2026-11-16T10:00:00.000Z");
    expect(weeklyHoursStanding(EVENING, inside)).toBe("active");
    expect(weeklyHoursStanding(EVENING, outside)).toBe("silent");
    expect(weeklyHoursStanding({ ...EVENING, announceOutside: true }, outside)).toBe(
      "shown_outside",
    );
    // Jugée au créneau : jamais « active » maintenant.
    expect(weeklyHoursStanding({ ...EVENING, moment: "handover_at" }, inside)).toBe("silent");
  });

  it("dit l'heure de la dernière plage finie aujourd'hui", () => {
    const twice = hours([
      { weekdays: EVERY_DAY, start: "07:00", end: "09:00" },
      { weekdays: EVERY_DAY, start: "17:00", end: "19:00" },
    ]);
    expect(weeklyHoursEndedAt(twice, new Date("2026-11-16T06:00:00.000Z"))).toBeNull();
    expect(weeklyHoursEndedAt(twice, new Date("2026-11-16T10:00:00.000Z"))).toBe("09:00");
    expect(weeklyHoursEndedAt(twice, new Date("2026-11-16T18:00:00.000Z"))).toBe("19:00");
    expect(
      weeklyHoursEndedAt({ ...twice, moment: "handover_at" }, new Date("2026-11-16T18:00:00.000Z")),
    ).toBeNull();
  });

  it("la phrase du journal dit l'instant, les jours et les heures", () => {
    expect(describeWeeklyHours(EVENING)).toBe("commandé tous les jours de 17 h à 19 h");
    expect(
      describeWeeklyHours(
        hours([{ weekdays: ["thu", "tue"], start: "07:30", end: "24:00" }], {
          moment: "handover_at",
          announceOutside: true,
        }),
      ),
    ).toBe("retiré ou livré le mardi et le jeudi de 7 h 30 à minuit, heures annoncées hors plage");
  });
});
