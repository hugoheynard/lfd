import { addDays } from "@lfd/contracts";

import { calendarCycleAt, calendarCycleToConstitute } from "../calendar-cycles.js";
import { autopilotTurn } from "../collection-autopilot.js";
import {
  entityCycleAt,
  entityCycleToConstitute,
  isEntityClosure,
  lastClosureAtOrBefore,
} from "../entity-closures.js";
import { InvoicingCalendar } from "../invoicing-calendar.js";
import { previousClosureOf } from "../invoicing-closures.js";
import { missedClosures } from "../missed-closures.js";
import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

/**
 * Le lot, son automatisme et la fiche sur le calendrier de la facture (M3).
 * Les dates sont le SUJET et ne se comparent qu'aux instants donnés.
 */

const WEEKLY_SINCE_AUGUST = {
  payerCompanyId: "c_week",
  segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" as const }],
};
const MIXED = InvoicingCalendar.of(defaultModes(), [WEEKLY_SINCE_AUGUST]);

/** Trois sondes par jour (00h00, 08h00, 23h59 à Paris), sur toute l'année 2026. */
function probes(): readonly Date[] {
  const all: Date[] = [];
  for (let day = "2026-01-01"; day < "2027-01-01"; day = addDays(day, 1)) {
    all.push(paris(day), paris(day, "08:00"), paris(day, "23:59"));
  }
  return all;
}

describe("le lot sur le calendrier — le mensuel au 1er STRICTEMENT égal à R4", () => {
  const monthly = ModeDatesTimeline.defaultOf("monthly");
  const calendar = InvoicingCalendar.of(defaultModes(), []);
  const recorded = [null, paris("2026-03-01"), paris("2026-06-15")];

  it("cycle en cours, cycle à constituer, clôture, tour de l'automatisme", () => {
    for (const now of probes()) {
      for (const previous of recorded) {
        expect(calendarCycleAt(now, calendar, previous)).toEqual(
          entityCycleAt(now, monthly, previous),
        );
        expect(calendarCycleToConstitute(now, calendar, previous)).toEqual(
          entityCycleToConstitute(now, monthly, previous),
        );
      }
      expect(calendar.isClosure(now)).toBe(isEntityClosure(now, monthly));
      expect(autopilotTurn(now, 1, calendar).cycleClosesAt).toEqual(
        lastClosureAtOrBefore(now, monthly),
      );
      const closure = lastClosureAtOrBefore(now, monthly);
      expect(calendar.closureBefore(closure)).toEqual(previousClosureOf(closure, monthly));
      expect(calendar.payerPeriodStartAt("anyone", closure)).toEqual(
        previousClosureOf(closure, monthly),
      );
    }
  });

  it("les clôtures manquées : les mêmes que sur la timeline mensuelle", () => {
    const coverage = {
      attemptedClosures: [paris("2026-02-01")],
      floorAt: null,
      lastLiveBatchClosesAt: null,
    };
    expect(missedClosures(paris("2026-06-01"), calendar, coverage)).toEqual(
      missedClosures(paris("2026-06-01"), InvoicingCalendar.following(monthly), coverage),
    );
    expect(missedClosures(paris("2026-06-01"), calendar, coverage)).toEqual([
      paris("2026-03-01"),
      paris("2026-04-01"),
      paris("2026-05-01"),
    ]);
  });
});

describe("rythmes mêlés : un payeur hebdomadaire, les autres au mensuel", () => {
  it("le lot d'un lundi va du lundi d'avant à ce lundi ; celui du 1er, du dernier lundi au 1er", () => {
    expect(calendarCycleToConstitute(paris("2026-09-28", "08:00"), MIXED, null)).toEqual({
      startsAt: paris("2026-09-21"),
      closesAt: paris("2026-09-28"),
    });
    expect(calendarCycleToConstitute(paris("2026-10-01", "08:00"), MIXED, null)).toEqual({
      startsAt: paris("2026-09-28"),
      closesAt: paris("2026-10-01"),
    });
    expect(calendarCycleAt(paris("2026-09-29"), MIXED, null)).toEqual({
      startsAt: paris("2026-09-28"),
      closesAt: paris("2026-10-01"),
    });
  });

  it("la période d'un payeur dans un lot : la sienne, pas celle du lot", () => {
    // Le lot du lundi 28 : le mensuel garde son mois d'août, l'hebdomadaire sa semaine.
    expect(MIXED.payerPeriodStartAt("c_month", paris("2026-09-28"))).toEqual(paris("2026-08-01"));
    expect(MIXED.payerPeriodStartAt("c_week", paris("2026-09-28"))).toEqual(paris("2026-09-21"));
    // Le lot du 1er : le mois du mensuel, la semaine de l'hebdomadaire.
    expect(MIXED.payerPeriodStartAt("c_month", paris("2026-10-01"))).toEqual(paris("2026-09-01"));
    expect(MIXED.payerPeriodStartAt("c_week", paris("2026-10-01"))).toEqual(paris("2026-09-21"));
  });

  it("l'automatisme vise le lundi, et un lundi non tenté est manqué", () => {
    expect(autopilotTurn(paris("2026-09-28", "08:00"), 1, MIXED).cycleClosesAt).toEqual(
      paris("2026-09-28"),
    );
    const coverage = {
      attemptedClosures: [paris("2026-09-14")],
      floorAt: null,
      lastLiveBatchClosesAt: null,
    };
    expect(missedClosures(paris("2026-10-01"), MIXED, coverage)).toEqual([
      paris("2026-09-21"),
      paris("2026-09-28"),
    ]);
  });

  /**
   * §16.6-6 : une entité sans payeur hebdomadaire n'a ni tentative ni alerte
   * un lundi — ni aujourd'hui, ni dans un passé où personne ne l'était.
   */
  it("aucun lundi avant que le payeur ne devienne hebdomadaire : rien de manqué", () => {
    const fromOctober = InvoicingCalendar.of(defaultModes(), [
      {
        payerCompanyId: "c_week",
        segments: [{ effectiveFrom: paris("2026-10-01"), mode: "weekly" as const }],
      },
    ]);
    const coverage = {
      attemptedClosures: [paris("2026-08-01")],
      floorAt: null,
      lastLiveBatchClosesAt: null,
    };
    expect(missedClosures(paris("2026-10-01"), fromOctober, coverage)).toEqual([
      paris("2026-09-01"),
    ]);
    expect(autopilotTurn(paris("2026-09-28", "08:00"), 1, fromOctober).cycleClosesAt).toEqual(
      paris("2026-09-01"),
    );
  });
});
