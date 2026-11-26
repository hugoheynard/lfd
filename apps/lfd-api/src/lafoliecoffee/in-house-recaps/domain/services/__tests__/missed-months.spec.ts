import { RecapMonth } from "../../value-objects/recap-month.js";
import { missedMonths } from "../missed-months.js";

// Instants de Paris, comparés entre eux seulement.
const MID_AUGUST = new Date("2026-08-15T10:00:00.000Z");
const OCTOBER_FIRST_MIDNIGHT = new Date("2026-09-30T22:00:00.000Z"); // 1er oct. 00h00 à Paris
const LAST_CLOSED = RecapMonth.fromKey("2026-11");

describe("missedMonths — mois clos, maison, sans issue", () => {
  it("une période ouverte : chaque mois clos depuis le marquage, moins ceux qui ont une issue", () => {
    const missed = missedMonths(
      [{ declaredAt: MID_AUGUST, withdrawnAt: null }],
      new Set(["2026-09", "2026-11"]),
      LAST_CLOSED,
    );
    expect(missed).toEqual(["2026-08", "2026-10"]);
  });

  it("un mois vide a une issue : il n'est pas manqué", () => {
    expect(
      missedMonths(
        [{ declaredAt: MID_AUGUST, withdrawnAt: null }],
        new Set(["2026-08", "2026-09", "2026-10", "2026-11"]),
        LAST_CLOSED,
      ),
    ).toEqual([]);
  });

  it("une période close au minuit du 1er n'entre pas dans le mois qui commence", () => {
    const missed = missedMonths(
      [{ declaredAt: MID_AUGUST, withdrawnAt: OCTOBER_FIRST_MIDNIGHT }],
      new Set(),
      LAST_CLOSED,
    );
    expect(missed).toEqual(["2026-08", "2026-09"]);
  });

  it("le mois en cours n'est jamais manqué", () => {
    expect(
      missedMonths(
        [{ declaredAt: MID_AUGUST, withdrawnAt: null }],
        new Set(),
        RecapMonth.fromKey("2026-07"),
      ),
    ).toEqual([]);
  });

  it("deux périodes ne comptent un mois qu'une fois", () => {
    const missed = missedMonths(
      [
        { declaredAt: MID_AUGUST, withdrawnAt: new Date("2026-08-20T10:00:00.000Z") },
        { declaredAt: new Date("2026-08-25T10:00:00.000Z"), withdrawnAt: null },
      ],
      new Set(),
      RecapMonth.fromKey("2026-08"),
    );
    expect(missed).toEqual(["2026-08"]);
  });
});
