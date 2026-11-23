import { eurosOfCents, eurosOfMillicents, eurosOfNullableCents } from "../euros.js";
import { parisIso, parisIsoToMinute } from "../paris-iso.js";

describe("eurosOfCents — des centimes en euros", () => {
  it.each([
    [1234, 12.34],
    [5, 0.05],
    [0, 0],
    [-250, -2.5],
    [1999, 19.99],
  ])("%i centimes valent %d €", (cents, euros) => {
    expect(eurosOfCents(cents)).toBe(euros);
    expect(JSON.stringify(eurosOfCents(cents))).toBe(String(euros));
  });

  it("garde null : une donnée absente n'est jamais un zéro", () => {
    expect(eurosOfNullableCents(null)).toBeNull();
    expect(eurosOfNullableCents(0)).toBe(0);
  });
});

describe("eurosOfMillicents — un prix unitaire à cinq décimales", () => {
  it("garde la précision exacte de la colonne, sans arrondir au centime", () => {
    expect(eurosOfMillicents(1_234_567)).toBe(12.34567);
    expect(JSON.stringify(eurosOfMillicents(118_180))).toBe("1.1818");
  });
});

describe("parisIso — l'heure de Paris, avec son décalage", () => {
  it("écrit l'heure d'hiver en +01:00 et l'heure d'été en +02:00", () => {
    expect(parisIso(new Date("2026-01-15T07:41:12.345Z"))).toBe("2026-01-15T08:41:12+01:00");
    expect(parisIso(new Date("2026-07-15T07:41:12.345Z"))).toBe("2026-07-15T09:41:12+02:00");
  });

  it("change de jour à minuit de Paris, pas à minuit UTC", () => {
    expect(parisIso(new Date("2026-07-14T22:30:00.000Z"))).toBe("2026-07-15T00:30:00+02:00");
  });

  it("tronque l'heure de passation à la minute, sans arrondir", () => {
    expect(parisIsoToMinute(new Date("2026-01-15T07:41:59.999Z"))).toBe(
      "2026-01-15T08:41:00+01:00",
    );
  });
});
