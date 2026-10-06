import { parisDate, parisDateTime } from "../paper-pdf-kit.js";

/**
 * Les dates des papiers du fournil. Instants recopiés, jamais comparés à
 * l'horloge (exception étroite du §5).
 */
describe("parisDate / parisDateTime", () => {
  /**
   * Régression : le pied « Arrêté le … » formatait le jour UTC, et une clôture
   * après 22 h heure de Paris (été) imprimait la veille (2026-10-06).
   */
  it("une clôture à 0 h 30 heure de Paris est datée du jour de Paris, pas de la veille UTC", () => {
    const closedAt = new Date("2026-10-06T22:30:00.000Z");
    expect(parisDate(closedAt)).toBe("7 octobre 2026");
    expect(parisDateTime(closedAt)).toBe("7 octobre 2026 à 00:30");
  });

  it("en hiver, le décalage est d'une heure", () => {
    expect(parisDate(new Date("2026-12-14T23:15:00.000Z"))).toBe("15 décembre 2026");
  });
});
