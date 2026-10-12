import { BillingRhythm } from "../../value-objects/billing-rhythm.js";
import { ModeDatesTimeline } from "../mode-dates-timeline.js";
import { PayerTimeline } from "../payer-timeline.js";
import { defaultModes, paris } from "./billing-mode-fixtures.js";

const iso = (dates: readonly Date[]): string[] => dates.map((date) => date.toISOString());

describe("PayerTimeline — la suite d'un payeur (M1, §16.2, §16.6-3)", () => {
  it("sans segment : mensuel, au 1er", () => {
    const timeline = PayerTimeline.of([], defaultModes());
    expect(timeline.modeAt(paris("2026-10-08"))).toEqual({ mode: "monthly", since: null });
    expect(timeline.closureAfter(paris("2026-10-08"))).toEqual(paris("2026-11-01"));
  });

  /**
   * Le 1er novembre 2026 est un DIMANCHE : la clôture T du mensuel n'est pas
   * une clôture de l'hebdomadaire. Le premier segment hebdomadaire court de T
   * au lundi suivant.
   */
  describe("bascule mensuel → hebdomadaire à T = 1er novembre, qui n'est pas un lundi", () => {
    const timeline = PayerTimeline.of(
      [{ effectiveFrom: paris("2026-11-01"), mode: "weekly" }],
      defaultModes(),
    );

    it("la suite réelle : 1er octobre, T, puis les lundis", () => {
      expect(iso(timeline.closuresBetween(paris("2026-09-15"), paris("2026-11-16")))).toEqual(
        iso([
          paris("2026-10-01"),
          paris("2026-11-01"),
          paris("2026-11-02"),
          paris("2026-11-09"),
          paris("2026-11-16"),
        ]),
      );
    });

    it("la première période hebdomadaire part de T, pas du lundi d'avant", () => {
      expect(timeline.previousClosureOf(paris("2026-11-02"))).toEqual(paris("2026-11-01"));
      expect(timeline.previousClosureOf(paris("2026-11-01"))).toEqual(paris("2026-10-01"));
    });

    it("dit le mode, le programmé et les modes suivis", () => {
      const before = paris("2026-10-08");
      expect(timeline.modeAt(paris("2026-11-03"))).toEqual({
        mode: "weekly",
        since: paris("2026-11-01"),
      });
      expect(timeline.scheduledAfter(before)?.mode).toBe("weekly");
      expect(timeline.changeLockedUntil(before)).toEqual(paris("2026-11-01"));
      expect(timeline.modesFrom(before)).toEqual(["monthly", "weekly"]);
      expect(timeline.modesFrom(paris("2026-11-03"))).toEqual(["weekly"]);
    });
  });

  it("bascule de mode ET de dates à la même clôture : le nouveau mode part de ses nouvelles dates", () => {
    const modes = defaultModes({
      semimonthly: ModeDatesTimeline.of("semimonthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.semimonthly(5, 20) },
      ]),
    });
    const timeline = PayerTimeline.of(
      [{ effectiveFrom: paris("2026-11-01"), mode: "semimonthly" }],
      modes,
    );

    expect(iso(timeline.closuresBetween(paris("2026-10-08"), paris("2026-12-05")))).toEqual(
      iso([paris("2026-11-01"), paris("2026-11-05"), paris("2026-11-20"), paris("2026-12-05")]),
    );
    expect(timeline.previousClosureOf(paris("2026-11-05"))).toEqual(paris("2026-11-01"));
  });

  it("un payeur resté mensuel suit la bascule des dates du mensuel", () => {
    const modes = defaultModes({
      monthly: ModeDatesTimeline.of("monthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) },
      ]),
    });
    const timeline = PayerTimeline.of([], modes);

    expect(iso(timeline.closuresBetween(paris("2026-10-08"), paris("2026-12-15")))).toEqual(
      iso([paris("2026-11-01"), paris("2026-11-15"), paris("2026-12-15")]),
    );
  });

  it("un payeur qui quitte le mensuel à la bascule de ses dates n'en voit jamais les nouvelles", () => {
    const modes = defaultModes({
      monthly: ModeDatesTimeline.of("monthly", [
        { effectiveFrom: paris("2026-11-01"), rhythm: BillingRhythm.monthly(15) },
      ]),
    });
    const timeline = PayerTimeline.of(
      [{ effectiveFrom: paris("2026-11-01"), mode: "weekly" }],
      modes,
    );

    expect(iso(timeline.closuresBetween(paris("2026-10-08"), paris("2026-11-16")))).toEqual(
      iso([paris("2026-11-01"), paris("2026-11-02"), paris("2026-11-09"), paris("2026-11-16")]),
    );
  });

  it("retour hebdomadaire → mensuel en fin d'année : le 4 janvier clôt la semaine, puis le 1er février", () => {
    const timeline = PayerTimeline.of(
      [
        { effectiveFrom: paris("2026-11-01"), mode: "weekly" },
        { effectiveFrom: paris("2026-12-28"), mode: "monthly" },
      ],
      defaultModes(),
    );

    expect(iso(timeline.closuresBetween(paris("2026-12-20"), paris("2027-02-01")))).toEqual(
      iso([paris("2026-12-21"), paris("2026-12-28"), paris("2027-01-01"), paris("2027-02-01")]),
    );
    expect(timeline.previousClosureOf(paris("2027-01-01"))).toEqual(paris("2026-12-28"));
  });
});
