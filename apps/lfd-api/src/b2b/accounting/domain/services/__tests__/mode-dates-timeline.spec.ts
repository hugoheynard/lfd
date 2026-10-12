import { InvalidBillingRhythmError } from "../../errors/billing-rhythm-errors.js";
import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import { paris } from "./billing-mode-fixtures.js";

const iso = (dates: readonly Date[]): string[] => dates.map((date) => date.toISOString());

describe("ModeDatesTimeline — la suite des dates d'un mode (M1, §16.6-1)", () => {
  it("sans segment : les dates par défaut du mode, pour toujours", () => {
    expect(
      ModeDatesTimeline.defaultOf("monthly").closureAfter(paris("2026-10-08", "12:00")),
    ).toEqual(paris("2026-11-01"));
    expect(
      ModeDatesTimeline.defaultOf("semimonthly").closureAfter(paris("2026-10-08", "12:00")),
    ).toEqual(paris("2026-10-16"));
    // Jeudi 8 octobre → lundi 12.
    expect(
      ModeDatesTimeline.defaultOf("weekly").closureAfter(paris("2026-10-08", "12:00")),
    ).toEqual(paris("2026-10-12"));
    expect(ModeDatesTimeline.defaultOf("weekly").inForceAt(paris("2026-10-08"))).toEqual({
      rhythm: BillingRhythm.weekly(1),
      since: null,
    });
  });

  describe("une bascule de dates du mensuel, le 1er au 15, au 1er novembre", () => {
    const timeline = ModeDatesTimeline.of("monthly", [
      { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) },
    ]);

    it("la période en cours se termine comme annoncée, la suivante suit les nouvelles dates", () => {
      expect(iso(timeline.closuresBetween(paris("2026-09-15"), paris("2026-12-31")))).toEqual(
        iso([paris("2026-10-01"), paris("2026-11-01"), paris("2026-11-15"), paris("2026-12-15")]),
      );
    });

    it("la clôture précédente réelle passe par la bascule", () => {
      expect(timeline.previousClosureOf(paris("2026-11-15"))).toEqual(paris("2026-11-01"));
      expect(timeline.previousClosureOf(paris("2026-11-01"))).toEqual(paris("2026-10-01"));
    });

    it("dit le programmé, le verrou et ce qui fait foi", () => {
      const before = paris("2026-10-08");
      expect(timeline.scheduledAfter(before)?.effectiveFrom).toEqual(paris("2026-11-01"));
      expect(timeline.changeLockedUntil(before)).toEqual(paris("2026-11-01"));
      expect(timeline.inForceAt(paris("2026-11-03"))).toEqual({
        rhythm: BillingRhythm.monthly(15),
        since: paris("2026-11-01"),
      });
      expect(timeline.scheduledAfter(paris("2026-11-03"))).toBeNull();
      expect(timeline.changeLockedUntil(paris("2026-11-03"))).toBeNull();
    });

    it("à l'instant exact de la prise d'effet, encore verrouillé, plus annulable", () => {
      expect(timeline.changeLockedUntil(paris("2026-11-01"))).toEqual(paris("2026-11-01"));
      expect(timeline.scheduledAfter(paris("2026-11-01"))).toBeNull();
    });
  });

  it("heure d'hiver : un lundi après le 25 octobre se clôt à 23h00 UTC, le précédent à 22h00", () => {
    const weekly = ModeDatesTimeline.defaultOf("weekly");
    expect(iso(weekly.closuresBetween(paris("2026-10-17"), paris("2026-10-27")))).toEqual([
      "2026-10-18T22:00:00.000Z",
      "2026-10-25T23:00:00.000Z",
    ]);
  });

  it("heure d'été : le 28 mars 2027 à minuit existe, et s'y clôt", () => {
    const monthly = ModeDatesTimeline.of("monthly", [
      { effectiveFrom: paris("2027-03-01"), rhythm: BillingRhythm.monthly(28) },
    ]);
    expect(monthly.closureAfter(paris("2027-03-02"))).toEqual(paris("2027-03-28"));
    expect(paris("2027-03-28").toISOString()).toBe("2027-03-27T23:00:00.000Z");
    expect(paris("2027-04-28").toISOString()).toBe("2027-04-27T22:00:00.000Z");
  });

  it("février : un 28 clôt bien en février, et le 1er de mars suit", () => {
    const semimonthly = ModeDatesTimeline.of("semimonthly", [
      { effectiveFrom: paris("2027-02-01"), rhythm: BillingRhythm.semimonthly(1, 28) },
    ]);
    expect(iso(semimonthly.closuresBetween(paris("2027-01-31"), paris("2027-03-01")))).toEqual(
      iso([paris("2027-02-01"), paris("2027-02-28"), paris("2027-03-01")]),
    );
  });

  it("fin d'année : le 1er janvier suit le 16 décembre", () => {
    const semimonthly = ModeDatesTimeline.defaultOf("semimonthly");
    expect(semimonthly.closureAfter(paris("2026-12-20"))).toEqual(paris("2027-01-01"));
    expect(semimonthly.previousClosureOf(paris("2027-01-01"))).toEqual(paris("2026-12-16"));
  });

  it("refuse un segment d'un autre mode", () => {
    expect(() =>
      ModeDatesTimeline.of("monthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.weekly(1) },
      ]),
    ).toThrow(InvalidBillingRhythmError);
  });

  it("deux suites aux mêmes segments sont égales, l'ordre d'arrivée n'y fait rien", () => {
    const a = { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) };
    const b = { effectiveFrom: paris("2026-12-15"), rhythm: BillingRhythm.monthly(5) };
    expect(
      ModeDatesTimeline.of("monthly", [a, b]).equals(ModeDatesTimeline.of("monthly", [b, a])),
    ).toBe(true);
    expect(
      ModeDatesTimeline.of("monthly", [a]).equals(ModeDatesTimeline.defaultOf("monthly")),
    ).toBe(false);
  });
});
