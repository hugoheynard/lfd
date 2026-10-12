import { ClosureCalendar } from "../closure-calendar.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

describe("ClosureCalendar — l'union des modes en service, plus le mensuel (§16.6-6)", () => {
  const thursday = paris("2026-10-08", "12:00");

  it("aucun payeur hebdomadaire : ni clôture ni alerte un lundi", () => {
    const calendar = ClosureCalendar.of(defaultModes(), []);
    expect(calendar.modes).toEqual(["monthly"]);
    expect(calendar.closureAfter(thursday)).toEqual(paris("2026-11-01"));
    expect(calendar.lastClosureAtOrBefore(thursday)).toEqual(paris("2026-10-01"));
    expect(calendar.isClosure(paris("2026-10-12"))).toBe(false);
  });

  it("un payeur hebdomadaire : ses lundis entrent au calendrier", () => {
    const calendar = ClosureCalendar.of(defaultModes(), ["weekly", "weekly"]);
    expect(calendar.modes).toEqual(["monthly", "weekly"]);
    expect(calendar.closureAfter(thursday)).toEqual(paris("2026-10-12"));
    expect(calendar.lastClosureAtOrBefore(thursday)).toEqual(paris("2026-10-05"));
    expect(calendar.isClosure(paris("2026-10-12"))).toBe(true);
    expect(calendar.upcoming(thursday, 3)).toEqual([
      paris("2026-10-12"),
      paris("2026-10-19"),
      paris("2026-10-26"),
    ]);
  });

  it("le 1er février 2027 est un lundi : deux modes closent au même instant", () => {
    const calendar = ClosureCalendar.of(defaultModes(), ["weekly", "semimonthly"]);
    expect(calendar.modesClosingAt(paris("2027-02-01"))).toEqual([
      "monthly",
      "weekly",
      "semimonthly",
    ]);
    expect(calendar.modesClosingAt(paris("2027-02-16"))).toEqual(["semimonthly"]);
    expect(calendar.isClosure(paris("2027-02-16", "00:01"))).toBe(false);
  });
});
