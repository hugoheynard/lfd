import { handoverInstantOf, isPastServiceDay } from "../invoice-handovers.seed.js";

/**
 * L'heure du retrait des commandes du semis des factures. Le jour est le
 * SUJET, comparé à lui-même : aucune horloge n'est lue.
 */
describe("handoverInstantOf", () => {
  it("retire le jour demandé, à 6 h à Paris — dans le créneau pro du Labo", () => {
    expect(handoverInstantOf("2026-09-11").toISOString()).toBe("2026-09-11T04:00:00.000Z");
  });

  it("garde le jour au passage à l'heure d'hiver", () => {
    expect(handoverInstantOf("2026-10-25").toISOString()).toBe("2026-10-25T05:00:00.000Z");
  });
});

/** Le jour est comparé à `now`, qui est un paramètre : relatif, jamais l'horloge. */
describe("isPastServiceDay", () => {
  const now = new Date("2030-01-15T08:00:00.000Z");

  it("retire la veille", () => {
    expect(isPastServiceDay("2030-01-14", now)).toBe(true);
  });

  it("ne retire jamais le jour même ni le lendemain", () => {
    expect(isPastServiceDay("2030-01-15", now)).toBe(false);
    expect(isPastServiceDay("2030-01-16", now)).toBe(false);
  });

  it("compare le jour de Paris, même juste après minuit", () => {
    // 00:30 à Paris le 15, encore le 14 en UTC.
    expect(isPastServiceDay("2030-01-15", new Date("2030-01-14T23:30:00.000Z"))).toBe(false);
  });
});
