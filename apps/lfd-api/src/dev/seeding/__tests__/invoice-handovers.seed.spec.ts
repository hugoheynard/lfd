import { handoverInstantOf, isPastServiceDay } from "../invoice-handovers.seed.js";

/**
 * L'heure du retrait des commandes du semis des factures. Le jour est le
 * SUJET, comparé à lui-même : aucune horloge n'est lue.
 */
describe("handoverInstantOf", () => {
  it("retire le jour demandé, à 6 h locales — dans le créneau pro du Labo", () => {
    const at = handoverInstantOf("2026-09-11");
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate()]).toEqual([2026, 9, 11]);
    expect([at.getHours(), at.getMinutes()]).toEqual([6, 0]);
  });

  it("garde le jour au passage à l'heure d'hiver", () => {
    const at = handoverInstantOf("2026-10-25");
    expect([at.getMonth() + 1, at.getDate(), at.getHours()]).toEqual([10, 25, 6]);
  });
});

/** Le jour est comparé à `now`, qui est un paramètre : relatif, jamais l'horloge. */
describe("isPastServiceDay", () => {
  const now = new Date(2030, 0, 15, 9);

  it("retire la veille", () => {
    expect(isPastServiceDay("2030-01-14", now)).toBe(true);
  });

  it("ne retire jamais le jour même ni le lendemain", () => {
    expect(isPastServiceDay("2030-01-15", now)).toBe(false);
    expect(isPastServiceDay("2030-01-16", now)).toBe(false);
  });

  it("compare le jour local, même juste après minuit", () => {
    expect(isPastServiceDay("2030-01-15", new Date(2030, 0, 15, 0, 30))).toBe(false);
  });
});
