import { dayColumn, serviceDayOfColumn } from "../day-column.js";

/** La journée en colonne `DATE`, partagée par les réassorts et les reçus (2026-11-02). */
describe("dayColumn / serviceDayOfColumn", () => {
  it("écrit la journée à minuit UTC", () => {
    expect(dayColumn("2026-03-29").toISOString()).toBe("2026-03-29T00:00:00.000Z");
  });

  it("relit la journée écrite, y compris un jour de changement d'heure", () => {
    for (const day of ["2026-03-29", "2026-10-25", "2026-12-31", "2027-01-01"]) {
      expect(serviceDayOfColumn(dayColumn(day))).toBe(day);
    }
  });
});
