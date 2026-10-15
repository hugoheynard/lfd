import { InvalidOperationDayError } from "../../errors/operation-errors.js";
import { CalendarDay } from "../calendar-day.js";

/**
 * Les jours de ces fixtures ne sont comparés qu'entre eux et à des instants
 * écrits à côté d'eux — jamais à l'horloge (CLAUDE.md §5, l'exception étroite).
 */
describe("CalendarDay", () => {
  it("accepte un jour qui existe", () => {
    expect(CalendarDay.of("2026-12-24", "le jour").value).toBe("2026-12-24");
    expect(CalendarDay.of("2028-02-29", "le jour").value).toBe("2028-02-29");
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "24/12/2026", "2026-12-24T00:00", ""])(
    "refuse « %s », en nommant le champ",
    (raw) => {
      expect(() => CalendarDay.of(raw, "le dernier jour de retrait")).toThrow(
        InvalidOperationDayError,
      );
      expect(() => CalendarDay.of(raw, "le dernier jour de retrait")).toThrow(
        /le dernier jour de retrait/u,
      );
    },
  );

  it("ordonne les jours comme le calendrier", () => {
    const first = CalendarDay.of("2026-12-20", "a");
    const last = CalendarDay.of("2026-12-24", "b");

    expect(last.isAfter(first)).toBe(true);
    expect(first.isAfter(last)).toBe(false);
    expect(first.isAfter(first)).toBe(false);
  });

  /**
   * `fin(jour)` = minuit, HEURE DE PARIS, le lendemain. Un `T00:00Z` collé au
   * jour l'aurait placée une heure trop tard en hiver, deux en été.
   */
  it("finit à minuit heure de Paris le lendemain, en hiver comme en été", () => {
    expect(CalendarDay.of("2026-12-24", "j").end().toISOString()).toBe("2026-12-24T23:00:00.000Z");
    expect(CalendarDay.of("2026-07-14", "j").end().toISOString()).toBe("2026-07-14T22:00:00.000Z");
  });

  /**
   * Le passage à l'heure d'hiver, le dimanche 25 octobre 2026 à 3 h : ce
   * jour-là dure vingt-cinq heures. La veille finit à 22 h UTC (heure d'été),
   * le jour même à 23 h UTC (heure d'hiver).
   */
  it("compte vingt-cinq heures au jour du passage à l'heure d'hiver", () => {
    const eve = CalendarDay.of("2026-10-24", "j").end();
    const day = CalendarDay.of("2026-10-25", "j").end();

    expect(eve.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(day.toISOString()).toBe("2026-10-25T23:00:00.000Z");
    expect((day.getTime() - eve.getTime()) / 3_600_000).toBe(25);
  });

  it("se dit JJ/MM/AAAA pour le staff", () => {
    expect(CalendarDay.of("2026-12-24", "j").toFrench()).toBe("24/12/2026");
  });
});
