import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import type { CollectionCalendarSettings } from "../collection-calendar.js";
import {
  calendarMonthAt,
  rhythmCalendarMonth,
  rhythmPeriodsIn,
} from "../rhythm-calendar-window.js";
import { paris } from "./billing-mode-fixtures.js";
import { InvalidCalendarMonthError } from "../../errors/accounting-errors.js";

/**
 * Les dates ne sont comparées qu'entre elles et à l'instant donné : aucune
 * horloge n'est lue (exception de la règle des fixtures, CLAUDE.md §5).
 */
const SETTINGS: CollectionCalendarSettings = {
  preNotificationDays: 14,
  collectionDaysAfterClosure: null,
  autoCollectionDelayHours: 1,
  depositCutoff: null,
};

// Un axe de six semaines, du lundi 5 octobre : les jalons s'y lisent des deux côtés d'un mois.
const WINDOW = { startsOn: "2026-10-05", endsOn: "2026-11-16" };

describe("rhythmCalendarMonth — l'axe du tableau de bord", () => {
  it("un mois calendaire, de son 1er au 1er du mois suivant exclu", () => {
    expect(rhythmCalendarMonth("2026-11")).toEqual({
      startsOn: "2026-11-01",
      endsOn: "2026-12-01",
    });
  });

  it("décembre finit au 1er janvier de l'année suivante", () => {
    expect(rhythmCalendarMonth("2026-12")).toEqual({
      startsOn: "2026-12-01",
      endsOn: "2027-01-01",
    });
  });

  it("refuse un mois mal formé", () => {
    expect(() => rhythmCalendarMonth("2026-13")).toThrow(InvalidCalendarMonthError);
    expect(() => rhythmCalendarMonth("2026-1")).toThrow(InvalidCalendarMonthError);
  });

  it("le mois en cours se lit à Paris : le 31 octobre à 23h30 est encore octobre", () => {
    expect(calendarMonthAt(paris("2026-10-31", "23:30"))).toBe("2026-10");
    expect(calendarMonthAt(paris("2026-11-01", "00:00"))).toBe("2026-11");
  });
});

describe("rhythmPeriodsIn — les jalons d'un rythme sur l'axe", () => {
  it("mensuel : la clôture passée dont l'échéance tombe sur l'axe, puis la suivante", () => {
    const periods = rhythmPeriodsIn(WINDOW, ModeDatesTimeline.defaultOf("monthly"), SETTINGS);

    expect(periods).toEqual([
      {
        closesAt: paris("2026-10-01"),
        invoicedOn: "2026-09-30",
        noticeOn: "2026-10-01",
        collectionDay: "2026-10-15",
        depositDeadline: null,
      },
      {
        closesAt: paris("2026-11-01"),
        invoicedOn: "2026-10-31",
        noticeOn: "2026-11-01",
        // Le 15 novembre est un dimanche : reporté au lundi, comme le lot.
        collectionDay: "2026-11-16",
        depositDeadline: null,
      },
    ]);
  });

  it("hebdomadaire : chaque lundi, plus le 1er du mois qui coupe la semaine", () => {
    const periods = rhythmPeriodsIn(WINDOW, ModeDatesTimeline.defaultOf("weekly"), SETTINGS);
    const closures = periods.map((period) => period.closesAt.toISOString());

    expect(closures).toContain(paris("2026-10-01").toISOString());
    expect(closures).toContain(paris("2026-11-02").toISOString());
    // La première : son échéance (lundi 5 octobre) ouvre l'axe.
    expect(periods[0]?.collectionDay).toBe("2026-10-05");
    // La dernière : sa facture (veille) est le dernier jour de l'axe.
    expect(periods.at(-1)?.invoicedOn).toBe("2026-11-15");
  });

  it("N réglé : l'échéance suit N, pas le délai de pré-notification", () => {
    const periods = rhythmPeriodsIn(WINDOW, ModeDatesTimeline.defaultOf("monthly"), {
      ...SETTINGS,
      collectionDaysAfterClosure: 20,
    });

    expect(periods.find((p) => p.invoicedOn === "2026-10-31")?.collectionDay).toBe("2026-11-23");
  });

  it("cut-off réglé : la limite de dépôt de chaque période, en jours ouvrés avant l'échéance", () => {
    const periods = rhythmPeriodsIn(WINDOW, ModeDatesTimeline.defaultOf("monthly"), {
      ...SETTINGS,
      depositCutoff: { businessDaysBefore: 2, time: "16:00" },
    });

    // Échéance jeudi 15 octobre → mardi 13 ; lundi 16 novembre → jeudi 12.
    expect(periods.map((p) => p.depositDeadline)).toEqual([
      { day: "2026-10-13", time: "16:00" },
      { day: "2026-11-12", time: "16:00" },
    ]);
  });
});
