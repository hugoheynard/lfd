import { stored } from "../queries/__tests__/collection-procedure-doubles.js";
import { lotModesByClosureDay } from "../procedure-rhythms-support.js";

/** Les rythmes des lots, par jour de clôture : les vivants d'abord, les annulés faute de mieux. */
describe("lotModesByClosureDay", () => {
  const DAY = "2026-10-01";

  it("réunit les rythmes des lots vivants d'une même clôture (CORE et B2B)", () => {
    const byDay = lotModesByClosureDay(
      [stored("core", { scheme: "CORE" }), stored("b2b")],
      [["weekly"], ["monthly"]],
    );

    expect(byDay.get(DAY)).toEqual(["weekly", "monthly"]);
  });

  it("un lot annulé ne compte pas quand un vivant existe", () => {
    const byDay = lotModesByClosureDay(
      [stored("old", { status: "cancelled" }), stored("live")],
      [["weekly"], ["monthly"]],
    );

    expect(byDay.get(DAY)).toEqual(["monthly"]);
  });

  it("seulement des lots annulés : leurs rythmes, pour que leurs fichiers gardent leur nom", () => {
    const byDay = lotModesByClosureDay([stored("old", { status: "cancelled" })], [["weekly"]]);

    expect(byDay.get(DAY)).toEqual(["weekly"]);
  });

  it("aucun lot : aucune entrée", () => {
    expect(lotModesByClosureDay([], []).size).toBe(0);
  });
});
