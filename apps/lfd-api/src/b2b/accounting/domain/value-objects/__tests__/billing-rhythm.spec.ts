import { InvalidBillingRhythmError } from "../../errors/billing-rhythm-errors.js";
import {
  BillingRhythm,
  DEFAULT_SEMIMONTHLY_CLOSING_DAYS,
  DEFAULT_WEEKLY_CLOSING_WEEKDAY,
} from "../billing-rhythm.js";

describe("BillingRhythm", () => {
  it("vaut mensuel le 1er par défaut", () => {
    expect(BillingRhythm.default().toRecord()).toEqual({ kind: "monthly", days: [1] });
  });

  it("expose les défauts bimensuel 1/16 et hebdomadaire lundi", () => {
    expect(DEFAULT_SEMIMONTHLY_CLOSING_DAYS).toEqual([1, 16]);
    expect(DEFAULT_WEEKLY_CLOSING_WEEKDAY).toBe(1);
  });

  it.each([0, 29, 31, 1.5, Number.NaN])("refuse le jour de mois %p", (day) => {
    expect(() => BillingRhythm.monthly(day)).toThrow(InvalidBillingRhythmError);
  });

  it.each([0, 8, 2.5])("refuse le jour de semaine %p", (weekday) => {
    expect(() => BillingRhythm.weekly(weekday)).toThrow(InvalidBillingRhythmError);
  });

  it("refuse deux clôtures bimensuelles le même jour", () => {
    expect(() => BillingRhythm.semimonthly(5, 5)).toThrow(/même jour/u);
  });

  it("refuse un bimensuel dont un jour est hors bornes", () => {
    expect(() => BillingRhythm.semimonthly(1, 30)).toThrow(InvalidBillingRhythmError);
  });

  it("range les jours du bimensuel triés", () => {
    expect(BillingRhythm.semimonthly(20, 5).days).toEqual([5, 20]);
    expect(BillingRhythm.semimonthly(20, 5).equals(BillingRhythm.semimonthly(5, 20))).toBe(true);
  });

  it("relit ce qu'il écrit", () => {
    for (const rhythm of [
      BillingRhythm.monthly(28),
      BillingRhythm.semimonthly(1, 16),
      BillingRhythm.weekly(7),
    ]) {
      expect(BillingRhythm.fromRecord(rhythm.toRecord()).equals(rhythm)).toBe(true);
    }
  });

  it.each([
    { kind: "monthly", days: [1, 16] },
    { kind: "semimonthly", days: [1] },
    { kind: "daily", days: [1] },
    { kind: "weekly", days: [] },
  ])("refuse la forme enregistrée %p", (record) => {
    expect(() => BillingRhythm.fromRecord(record)).toThrow(InvalidBillingRhythmError);
  });

  it("revalide les jours d'une forme enregistrée", () => {
    expect(() => BillingRhythm.fromRecord({ kind: "monthly", days: [31] })).toThrow(
      InvalidBillingRhythmError,
    );
  });

  it("ne confond pas un mensuel le 1 et un hebdomadaire le lundi", () => {
    expect(BillingRhythm.monthly(1).equals(BillingRhythm.weekly(1))).toBe(false);
  });
});
