import { InvoicingCalendar } from "../invoicing-calendar.js";
import { closuresOfMonth } from "../month-closures.js";
import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

/**
 * Les clôtures de l'écran « Prélèvement du mois » (M4c). Les dates sont le
 * sujet : elles ne se comparent qu'à l'instant `now` donné.
 */

const WEEKLY = {
  payerCompanyId: "c_week",
  segments: [{ effectiveFrom: paris("2026-08-01"), mode: "weekly" as const }],
};

describe("closuresOfMonth — les clôtures du mois en cours, et la dernière passée", () => {
  it("mensuel au 1er, le 20 : la seule clôture d'octobre", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), []);
    expect(closuresOfMonth(calendar, paris("2026-10-20", "08:00"))).toEqual([paris("2026-10-01")]);
  });

  it("le 31 à 23h57 : la clôture du 1er novembre s'ajoute, ses factures sont dues", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), []);
    expect(closuresOfMonth(calendar, paris("2026-10-31", "23:57"))).toEqual([
      paris("2026-10-01"),
      paris("2026-11-01"),
    ]);
  });

  it("rythmes mêlés : le 1er et tous les lundis du mois, passés comme à venir, dans l'ordre", () => {
    const calendar = InvoicingCalendar.of(defaultModes(), [WEEKLY]);
    expect(closuresOfMonth(calendar, paris("2026-10-06", "08:00"))).toEqual([
      paris("2026-10-01"),
      paris("2026-10-05"),
      paris("2026-10-12"),
      paris("2026-10-19"),
      paris("2026-10-26"),
    ]);
  });

  it("mensuel au 15, le 3 : la dernière passée (15 septembre) précède celle du mois", () => {
    const monthly = ModeDatesTimeline.of("monthly", [
      { effectiveFrom: paris("2026-01-01"), rhythm: BillingRhythm.monthly(15) },
    ]);
    const calendar = InvoicingCalendar.of(defaultModes({ monthly }), []);
    expect(closuresOfMonth(calendar, paris("2026-10-03", "08:00"))).toEqual([
      paris("2026-09-15"),
      paris("2026-10-15"),
    ]);
  });
});
