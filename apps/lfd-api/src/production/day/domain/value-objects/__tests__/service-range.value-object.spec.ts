import { ServiceRange } from "../service-range.value-object.js";

describe("ServiceRange", () => {
  it("découpe une plage en jours, bornes comprises", () => {
    const range = ServiceRange.of("2026-09-03", "2026-09-09");
    expect(range.days.map((day) => day.value)).toEqual([
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
    ]);
    expect(range.length).toBe(7);
  });

  it("accepte une plage d'un seul jour", () => {
    const range = ServiceRange.of("2026-09-03", "2026-09-03");
    expect(range.days.map((day) => day.value)).toEqual(["2026-09-03"]);
  });

  it("traverse un changement de mois", () => {
    const range = ServiceRange.of("2026-08-30", "2026-09-01");
    expect(range.days.map((day) => day.value)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"]);
  });

  /**
   * Régression attendue : l'arithmétique se fait en UTC, à minuit. Un
   * `setDate()` en heure locale rendrait deux fois le même jour au passage à
   * l'heure d'hiver — un samedi fantôme, que personne ne chercherait là.
   */
  it("ne redouble aucun jour au changement d'heure", () => {
    const range = ServiceRange.of("2026-10-24", "2026-10-27");
    expect(range.days.map((day) => day.value)).toEqual([
      "2026-10-24",
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
    ]);
  });

  it("refuse une fin qui précède le début", () => {
    expect(() => ServiceRange.of("2026-09-09", "2026-09-03")).toThrow(/précède/u);
  });

  it("refuse une plage plus large qu'une matrice lisible", () => {
    expect(() => ServiceRange.of("2026-01-01", "2026-03-01")).toThrow(/31 au maximum/u);
  });

  it("accepte exactement la borne haute", () => {
    expect(ServiceRange.of("2026-01-01", "2026-01-31").length).toBe(31);
  });

  it("refuse un jour qui n'est pas ISO", () => {
    expect(() => ServiceRange.of("03/09/2026", "2026-09-09")).toThrow(/Jour de service invalide/u);
  });

  it("donne l'index de colonne d'un jour, et -1 hors plage", () => {
    const range = ServiceRange.of("2026-09-03", "2026-09-05");
    expect(range.indexOf("2026-09-04")).toBe(1);
    expect(range.indexOf("2026-09-12")).toBe(-1);
  });
});
