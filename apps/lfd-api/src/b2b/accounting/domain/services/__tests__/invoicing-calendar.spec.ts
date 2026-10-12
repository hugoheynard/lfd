import { addDays } from "@lfd/contracts";

import { InvoicingCalendar } from "../invoicing-calendar.js";
import {
  closuresToAttempt,
  closureToInvoice,
  invoicedPeriodOf,
  MAX_CLOSURES_PER_PASS,
} from "../invoicing-closures.js";
import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

/**
 * Le calendrier de la facture (M2) : l'union des suites des payeurs et du
 * mensuel. Les dates sont le sujet et ne se comparent qu'aux instants donnés.
 */

const WEEKLY_SINCE_AUGUST = {
  payerCompanyId: "c_week",
  segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" as const }],
};

/** Trois sondes par jour (08h, 23h54, 23h55 à Paris), sur toute l'année 2026. */
function probes(): readonly Date[] {
  const all: Date[] = [];
  for (let day = "2026-01-01"; day < "2027-01-01"; day = addDays(day, 1)) {
    all.push(paris(day, "08:00"), paris(day, "23:54"), paris(day, "23:55"));
  }
  return all;
}

describe("InvoicingCalendar — la facture par payeur à sa clôture (M2)", () => {
  it("personne n'a choisi : STRICTEMENT le mensuel de R3 — clôture, rattrapage, période", () => {
    const monthly = ModeDatesTimeline.defaultOf("monthly");
    const calendar = InvoicingCalendar.of(defaultModes(), []);
    const after = paris("2026-01-01");
    for (const now of probes()) {
      const closesAt = closureToInvoice(now, monthly);
      expect(calendar.closureToInvoice(now)).toEqual(closesAt);
      expect(calendar.closuresToAttempt(now, after)).toEqual(
        closuresToAttempt(now, monthly, after),
      );
      expect(calendar.closuresToAttempt(now, null)).toEqual(closuresToAttempt(now, monthly, null));
      expect(calendar.periodOf(closesAt)).toEqual(invoicedPeriodOf(closesAt, monthly));
      expect(calendar.payerPeriodOf("anyone", closesAt)).toEqual(
        invoicedPeriodOf(closesAt, monthly),
      );
    }
  });

  it("le mensuel réglé au 5 : le calendrier suit SES dates, pas le 1er", () => {
    const monthly = ModeDatesTimeline.of("monthly", [
      { effectiveFrom: paris("2026-09-01"), rhythm: BillingRhythm.monthly(5) },
    ]);
    const calendar = InvoicingCalendar.of(defaultModes({ monthly }), []);
    expect(calendar.closureAfter(paris("2026-09-01"))).toEqual(paris("2026-09-05"));
    expect(calendar.isClosure(paris("2026-10-01"))).toBe(false);
  });

  it("un payeur hebdomadaire : ses lundis et le 1er, et chacun clôt à SES instants", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), [WEEKLY_SINCE_AUGUST]);
    const monday = paris("2026-09-28");
    const first = paris("2026-10-01");

    expect(calendar.isClosure(monday)).toBe(true);
    expect(calendar.closesFor("c_week", monday)).toBe(true);
    expect(calendar.closesFor("c_month", monday)).toBe(false);
    expect(calendar.closesFor("c_week", first)).toBe(false);
    expect(calendar.closesFor("c_month", first)).toBe(true);
    expect(calendar.payerPeriodOf("c_week", monday)).toEqual({
      startsAt: paris("2026-09-21"),
      closesAt: monday,
    });
    expect(calendar.payerPeriodOf("c_month", first)).toEqual({
      startsAt: paris("2026-09-01"),
      closesAt: first,
    });
  });

  it("rattrapage : les lundis et le 1er dans l'ordre, chacun une fois", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), [WEEKLY_SINCE_AUGUST]);
    expect(calendar.closuresToAttempt(paris("2026-10-06", "10:00"), paris("2026-09-21"))).toEqual([
      paris("2026-09-28"),
      paris("2026-10-01"),
      paris("2026-10-05"),
    ]);
  });

  it("un payeur devenu hebdomadaire au 1er octobre ne met aucun lundi de septembre au calendrier", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), [
      {
        payerCompanyId: "c_week",
        segments: [{ effectiveFrom: paris("2026-10-01"), mode: "weekly" }],
      },
    ]);
    expect(calendar.isClosure(paris("2026-09-28"))).toBe(false);
    expect(calendar.closesFor("c_week", paris("2026-10-01"))).toBe(true);
    expect(calendar.payerPeriodOf("c_week", paris("2026-10-05"))).toEqual({
      startsAt: paris("2026-10-01"),
      closesAt: paris("2026-10-05"),
    });
  });

  it("un payeur repassé au mensuel au lundi 5 octobre : clôt le 5, puis plus avant le 1er novembre", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), [
      {
        payerCompanyId: "c_week",
        segments: [
          { effectiveFrom: paris("2026-08-01"), mode: "weekly" },
          { effectiveFrom: paris("2026-10-05"), mode: "monthly" },
        ],
      },
    ]);
    expect(calendar.closesFor("c_week", paris("2026-10-05"))).toBe(true);
    expect(calendar.isClosure(paris("2026-10-12"))).toBe(false);
    expect(calendar.payerPeriodOf("c_week", paris("2026-11-01"))).toEqual({
      startsAt: paris("2026-10-05"),
      closesAt: paris("2026-11-01"),
    });
  });

  it("deux suites closent ensemble : la période affichée est la plus longue", () => {
    // Le 1er février 2027 est un lundi.
    const calendar = InvoicingCalendar.of(defaultModes(), [WEEKLY_SINCE_AUGUST]);
    expect(calendar.periodOf(paris("2027-02-01"))).toEqual({
      startsAt: paris("2027-01-01"),
      closesAt: paris("2027-02-01"),
    });
  });

  it("un plancher ancien : au plus MAX_CLOSURES_PER_PASS, les plus anciennes d'abord", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), [WEEKLY_SINCE_AUGUST]);
    const closures = calendar.closuresToAttempt(paris("2026-12-20"), paris("2026-08-01"));
    expect(closures).toHaveLength(MAX_CLOSURES_PER_PASS);
    expect(closures[0]).toEqual(paris("2026-08-03"));
  });
});
