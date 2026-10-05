import { isoDay } from "../order-placing.seed.js";
import { currentMonthDays } from "../sub-account-orders.seed.js";
import { startOfPreviousMonth } from "../sub-account-pricing.seed.js";

/**
 * Les jours que le semis des sous-comptes vise. Les dates sont le SUJET : la
 * fonction reçoit son instant et ne lit aucune horloge, d'où des dates
 * absolues, comparées entre elles.
 */
describe("startOfPreviousMonth", () => {
  it("rend le 1er du mois précédent à minuit, y compris au passage de l'année", () => {
    expect(isoDay(startOfPreviousMonth(new Date(2026, 9, 5, 14)))).toBe("2026-09-01");
    expect(isoDay(startOfPreviousMonth(new Date(2027, 0, 31, 23)))).toBe("2026-12-01");
    expect(startOfPreviousMonth(new Date(2026, 9, 5, 14)).getHours()).toBe(0);
  });
});

describe("currentMonthDays", () => {
  it("prend du 2 du mois jusqu'à avant-hier quand le mois en offre au moins deux", () => {
    expect(currentMonthDays(new Date(2026, 9, 5, 14)).map(isoDay)).toEqual([
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("passe après la fenêtre du semis du jour (J+3, J+4) quand le mois est trop jeune", () => {
    expect(currentMonthDays(new Date(2026, 9, 1, 14)).map(isoDay)).toEqual([
      "2026-10-04",
      "2026-10-05",
    ]);
  });

  it("ne vise jamais hier, aujourd'hui, demain ni J+2 — les journées que tient le semis du jour", () => {
    const now = new Date(2026, 9, 20, 14);
    const days = currentMonthDays(now).map(isoDay);
    expect(days).not.toContain("2026-10-19");
    expect(days).not.toContain("2026-10-20");
    expect(days).not.toContain("2026-10-22");
    expect(days.every((day) => day.startsWith("2026-10-"))).toBe(true);
  });
});
