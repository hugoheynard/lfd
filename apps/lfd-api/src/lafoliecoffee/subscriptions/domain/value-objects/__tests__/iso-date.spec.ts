import { InvalidOccurrenceDateError } from "../../errors/subscription-errors.js";
import { IsoDate } from "../iso-date.js";

describe("IsoDate", () => {
  describe("fromString", () => {
    it("accepte une date bien formée", () => {
      expect(IsoDate.fromString("2026-08-10").toString()).toBe("2026-08-10");
    });

    it("accepte le 29 février d'une année bissextile", () => {
      expect(IsoDate.fromString("2024-02-29").toString()).toBe("2024-02-29");
    });

    it("refuse le 29 février d'une année non bissextile", () => {
      expect(() => IsoDate.fromString("2026-02-29")).toThrow(InvalidOccurrenceDateError);
    });

    it("refuse une date inexistante (30 février)", () => {
      expect(() => IsoDate.fromString("2026-02-30")).toThrow(InvalidOccurrenceDateError);
    });

    it("refuse un mois hors bornes", () => {
      expect(() => IsoDate.fromString("2026-13-01")).toThrow(InvalidOccurrenceDateError);
    });

    it("refuse un format non AAAA-MM-JJ", () => {
      expect(() => IsoDate.fromString("10/08/2026")).toThrow(InvalidOccurrenceDateError);
      expect(() => IsoDate.fromString("2026-8-1")).toThrow(InvalidOccurrenceDateError);
    });
  });

  describe("fromDate / toUtcDate — aller-retour sans décalage de fuseau", () => {
    it("reconstruit la même date depuis un Date minuit UTC", () => {
      const date = new Date("2026-08-10T00:00:00.000Z");
      expect(IsoDate.fromDate(date).toString()).toBe("2026-08-10");
    });

    it("toUtcDate rend bien minuit UTC", () => {
      expect(IsoDate.fromString("2026-08-10").toUtcDate().toISOString()).toBe(
        "2026-08-10T00:00:00.000Z",
      );
    });
  });

  describe("comparaisons", () => {
    const a = IsoDate.fromString("2026-08-10");
    const b = IsoDate.fromString("2026-08-17");

    it("ordonne deux dates", () => {
      expect(a.isBefore(b)).toBe(true);
      expect(b.isAfter(a)).toBe(true);
    });

    it("une date n'est ni avant ni après elle-même, mais lui est égale", () => {
      expect(a.isBefore(a)).toBe(false);
      expect(a.isAfter(a)).toBe(false);
      expect(a.equals(IsoDate.fromString("2026-08-10"))).toBe(true);
    });
  });
});

describe("IsoDate.plusDays / latest — l'horizon du planificateur", () => {
  it("avance d'un nombre de jours, à travers les mois et l'heure d'hiver", () => {
    expect(IsoDate.fromString("2026-10-24").plusDays(7).toString()).toBe("2026-10-31");
    expect(IsoDate.fromString("2026-11-28").plusDays(7).toString()).toBe("2026-12-05");
    expect(IsoDate.fromString("2026-12-31").plusDays(1).toString()).toBe("2027-01-01");
  });

  it("recule avec un nombre négatif", () => {
    expect(IsoDate.fromString("2026-03-01").plusDays(-1).toString()).toBe("2026-02-28");
  });

  it("garde le plus tardif de deux jours", () => {
    const early = IsoDate.fromString("2026-11-23");
    const late = IsoDate.fromString("2026-11-30");
    expect(IsoDate.latest(early, late)).toBe(late);
    expect(IsoDate.latest(late, early)).toBe(late);
  });
});
