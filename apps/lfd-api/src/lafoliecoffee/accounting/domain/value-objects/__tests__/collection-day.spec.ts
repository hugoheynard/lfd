import { InvalidCollectionDayError } from "../../errors/collection-errors.js";
import { CollectionDay } from "../collection-day.js";

// Les jours ne sont comparés qu'entre eux : aucune horloge n'est lue ici.
describe("CollectionDay", () => {
  it("garde un jour AAAA-MM-JJ tel quel", () => {
    expect(CollectionDay.of("2026-10-15").value).toBe("2026-10-15");
    expect(CollectionDay.of("2026-10-15").toString()).toBe("2026-10-15");
  });

  it.each(["", "2026-1-15", "15/10/2026", "2026-10-15T00:00:00.000Z", " 2026-10-15"])(
    "refuse une forme qui n'est pas un jour : « %s »",
    (raw) => {
      expect(() => CollectionDay.of(raw)).toThrow(InvalidCollectionDayError);
    },
  );

  it("refuse un jour qui n'existe pas au calendrier (30 février)", () => {
    expect(() => CollectionDay.of("2026-02-30")).toThrow(InvalidCollectionDayError);
  });

  it("accepte un 29 février d'année bissextile", () => {
    expect(CollectionDay.of("2028-02-29").value).toBe("2028-02-29");
  });

  it("ordonne comme le calendrier, à cheval sur un changement de mois et d'année", () => {
    expect(CollectionDay.of("2026-11-01").isAfter(CollectionDay.of("2026-10-31"))).toBe(true);
    expect(CollectionDay.of("2027-01-01").isAfter(CollectionDay.of("2026-12-31"))).toBe(true);
    expect(CollectionDay.of("2026-10-15").isAfter(CollectionDay.of("2026-10-15"))).toBe(false);
    expect(CollectionDay.of("2026-10-14").isAfter(CollectionDay.of("2026-10-15"))).toBe(false);
  });

  it("compare par valeur", () => {
    expect(CollectionDay.of("2026-10-15").equals(CollectionDay.of("2026-10-15"))).toBe(true);
    expect(CollectionDay.of("2026-10-15").equals(CollectionDay.of("2026-10-16"))).toBe(false);
  });
});
