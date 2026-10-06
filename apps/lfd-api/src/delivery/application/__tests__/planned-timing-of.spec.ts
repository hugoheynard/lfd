import { parisInstantOf, plannedTimingOf } from "../planned-timing-of.js";

// Des jours convertis en instants — jamais comparés à l'horloge (§5, exception étroite).
const HOUR = 3_600;

describe("parisInstantOf — une heure du calcul de tournée, en instant", () => {
  it("lit l'heure de Paris, hiver comme été", () => {
    expect(parisInstantOf("2030-01-15", 6.5 * HOUR)?.toISOString()).toBe(
      "2030-01-15T05:30:00.000Z",
    );
    expect(parisInstantOf("2030-07-15", 6.5 * HOUR)?.toISOString()).toBe(
      "2030-07-15T04:30:00.000Z",
    );
  });

  it("passé minuit, c'est le lendemain", () => {
    expect(parisInstantOf("2030-01-15", 25 * HOUR)?.toISOString()).toBe("2030-01-16T00:00:00.000Z");
  });

  it("une heure qui n'existe pas (passage à l'heure d'été) se compte depuis minuit", () => {
    expect(parisInstantOf("2030-03-31", 2.5 * HOUR)?.toISOString()).toBe(
      "2030-03-31T01:30:00.000Z",
    );
  });

  it("un jour illisible ne donne rien", () => {
    expect(parisInstantOf("pas-un-jour", HOUR)).toBeNull();
  });
});

describe("plannedTimingOf", () => {
  it("rend départ, retour et mètres entiers", () => {
    const timing = plannedTimingOf("2030-01-15", {
      departure: 6.5 * HOUR,
      return: 9.75 * HOUR,
      meters: 41_600.4,
      arrivals: [],
      missed: [],
      lateSeconds: 0,
    });
    expect(timing?.departureAt.toISOString()).toBe("2030-01-15T05:30:00.000Z");
    expect(timing?.returnAt.toISOString()).toBe("2030-01-15T08:45:00.000Z");
    expect(timing?.meters).toBe(41_600);
  });
});
