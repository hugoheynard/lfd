import { isPooledClosure, procedureCodeOf } from "../collection-procedure-code.js";
import { procedureRhythms } from "../procedure-rhythms.js";
import type { BillingMode } from "../../value-objects/billing-mode.js";
import { paris } from "./billing-mode-fixtures.js";

/**
 * Les rythmes d'une procédure (Hugo, 2026-10-23) : un rythme ne compte que
 * s'il a un client. Le lundi 1er tombe un 1er février 2027.
 */
const MONDAY_FIRST = paris("2027-02-01");
const BOTH: readonly BillingMode[] = ["monthly", "weekly"];

function counts(entries: readonly (readonly [BillingMode, number])[]): Map<BillingMode, number> {
  return new Map(entries);
}

describe("procedureRhythms — un rythme ne compte que s'il a des clients", () => {
  /** Régression : le lundi 1er était « HM / mutualisée » sans aucun client mensuel. */
  it("lundi 1er, sans lot ni client mensuel : -H, pas mutualisée", () => {
    const modes = procedureRhythms({
      closureModes: BOTH,
      lotModes: null,
      payerCounts: counts([
        ["weekly", 2],
        ["monthly", 0],
      ]),
    });

    expect(modes).toEqual(["weekly"]);
    expect(procedureCodeOf(MONDAY_FIRST, modes)).toBe("PRL-270201-H");
    expect(isPooledClosure(modes)).toBe(false);
  });

  it("un lot d'hebdomadaires et de mensuels : HM, mutualisée — même sans compte aujourd'hui", () => {
    const modes = procedureRhythms({
      closureModes: BOTH,
      lotModes: ["weekly", "monthly"],
      payerCounts: counts([]),
    });

    expect(modes).toEqual(["monthly", "weekly"]);
    expect(procedureCodeOf(MONDAY_FIRST, modes)).toBe("PRL-270201-HM");
    expect(isPooledClosure(modes)).toBe(true);
  });

  it("un lot : ses clients font les rythmes, même si le compte d'aujourd'hui en dit plus", () => {
    const modes = procedureRhythms({
      closureModes: BOTH,
      lotModes: ["monthly"],
      payerCounts: counts([
        ["weekly", 3],
        ["monthly", 1],
      ]),
    });

    expect(modes).toEqual(["monthly"]);
  });

  it("aucun rythme avec client : code sans lettre, jamais mutualisée", () => {
    const modes = procedureRhythms({
      closureModes: BOTH,
      lotModes: null,
      payerCounts: counts([["monthly", 0]]),
    });

    expect(modes).toEqual([]);
    expect(procedureCodeOf(MONDAY_FIRST, modes)).toBe("PRL-270201");
    expect(isPooledClosure(modes)).toBe(false);
  });

  it("un lot sans client : sans lettre", () => {
    expect(
      procedureRhythms({ closureModes: BOTH, lotModes: [], payerCounts: counts([["weekly", 1]]) }),
    ).toEqual([]);
  });

  it("un rythme qui a des clients mais ne clôt pas ce jour-là n'y entre pas", () => {
    expect(
      procedureRhythms({
        closureModes: ["monthly"],
        lotModes: null,
        payerCounts: counts([
          ["weekly", 4],
          ["monthly", 1],
        ]),
      }),
    ).toEqual(["monthly"]);
  });
});
