import { InvalidRecapMonthError } from "../../errors/in-house-recap-errors.js";
import { RecapMonth } from "../recap-month.js";

describe("RecapMonth — le mois civil de Paris", () => {
  it("refuse une clé mal formée", () => {
    for (const key of ["2026-13", "2026-00", "2026-1", "26-01", "2026-01-01", ""]) {
      expect(() => RecapMonth.fromKey(key)).toThrow(InvalidRecapMonthError);
    }
  });

  it("ses bornes sont les minuits de Paris, heure d'hiver et d'été", () => {
    // Janvier : UTC+1 ; juillet : UTC+2.
    expect(RecapMonth.fromKey("2026-01").window()).toEqual({
      from: new Date("2025-12-31T23:00:00.000Z"),
      to: new Date("2026-01-31T23:00:00.000Z"),
    });
    expect(RecapMonth.fromKey("2026-07").window().from).toEqual(
      new Date("2026-06-30T22:00:00.000Z"),
    );
  });

  it("le mois qui change d'heure garde ses deux minuits (mars : 31 jours moins une heure)", () => {
    const { from, to } = RecapMonth.fromKey("2026-03").window();
    expect(to.getTime() - from.getTime()).toBe((31 * 24 - 1) * 3600 * 1000);
  });

  it("un BL remis le 1er à 00h30 à Paris est du mois qui commence, pas du précédent", () => {
    const firstAtHalfPast = new Date("2026-10-31T23:30:00.000Z"); // 1er nov., 00h30 à Paris
    expect(RecapMonth.containing(firstAtHalfPast).key).toBe("2026-11");
    expect(RecapMonth.fromKey("2026-10").contains(firstAtHalfPast)).toBe(false);
    expect(RecapMonth.fromKey("2026-11").contains(firstAtHalfPast)).toBe(true);
  });

  it("le dernier mois clos est celui d'avant, à cheval sur l'année", () => {
    expect(RecapMonth.lastClosedAt(new Date("2027-01-01T00:00:00.000Z")).key).toBe("2026-12");
    expect(RecapMonth.lastClosedAt(new Date("2026-12-31T22:59:00.000Z")).key).toBe("2026-11");
  });

  it("suivant et précédent passent l'année", () => {
    expect(RecapMonth.fromKey("2026-12").next().key).toBe("2027-01");
    expect(RecapMonth.fromKey("2027-01").previous().key).toBe("2026-12");
    expect(RecapMonth.fromKey("2026-12").isBefore(RecapMonth.fromKey("2027-01"))).toBe(true);
  });
});
