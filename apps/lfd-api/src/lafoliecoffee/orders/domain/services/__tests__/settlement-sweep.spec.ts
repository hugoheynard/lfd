import { settlementSweepWindow } from "../settlement-sweep.js";

/*
 * Les dates ici sont le SUJET du test et ne sont comparées qu'entre elles :
 * aucune n'est opposée à l'horloge (CLAUDE.md §5, la seule exception).
 */
describe("settlementSweepWindow — le jour de passation, à l'heure de Paris (Q5, S6)", () => {
  it("en hiver, la journée court de 23 h UTC la veille à 23 h UTC le jour même", () => {
    expect(settlementSweepWindow("2026-01-15")).toEqual({
      serviceDay: "2026-01-15",
      placedFrom: new Date("2026-01-14T23:00:00.000Z"),
      placedBefore: new Date("2026-01-15T23:00:00.000Z"),
    });
  });

  it("en été, elle court de 22 h UTC à 22 h UTC", () => {
    const window = settlementSweepWindow("2026-07-15");

    expect(window.placedFrom).toEqual(new Date("2026-07-14T22:00:00.000Z"));
    expect(window.placedBefore).toEqual(new Date("2026-07-15T22:00:00.000Z"));
  });

  it("le jour du passage à l'heure d'été ne dure que 23 heures", () => {
    const window = settlementSweepWindow("2026-03-29");

    expect(window.placedBefore.getTime() - window.placedFrom.getTime()).toBe(23 * 3_600_000);
  });

  it("le jour du retour à l'heure d'hiver en dure 25", () => {
    const window = settlementSweepWindow("2026-10-25");

    expect(window.placedBefore.getTime() - window.placedFrom.getTime()).toBe(25 * 3_600_000);
  });
});
