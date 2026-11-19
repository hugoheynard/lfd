import { procedureRowView } from "../collection-procedure-list-support.js";
import type { ProcedureRow } from "../../domain/services/collection-procedure-list.js";
import { defaultModes, paris } from "../../domain/services/__tests__/billing-mode-fixtures.js";
import type { BillingMode } from "../../domain/value-objects/billing-mode.js";

/**
 * Les périodes d'une ligne, par rythme. Les dates ne sont comparées qu'entre
 * elles et au calendrier des modes : aucune horloge n'est lue.
 */

const DEC_1 = paris("2026-12-01");

function row(): ProcedureRow {
  return {
    id: "le1~2026-12-01",
    closesAt: DEC_1,
    periodLabel: "du 30 au 30 novembre 2026",
    modes: ["monthly", "semimonthly"],
    phase: "open",
    stage: "file",
    batches: [],
    followed: null,
    collectionDay: null,
    depositDeadline: null,
    warnings: [],
    orderCount: null,
  };
}

function viewWith(modes: readonly BillingMode[]) {
  return procedureRowView("le1", row(), () => modes, defaultModes());
}

describe("procedureRowView — les périodes de chaque rythme", () => {
  /**
   * Régression : une clôture mutualisée au 1er décembre, le lendemain d'une
   * clôture hebdomadaire, se titrait « du 30 au 30 novembre ».
   */
  it("une clôture mutualisée dit la période entière de chacun de ses rythmes", () => {
    expect(viewWith(["monthly", "semimonthly"]).periods).toEqual([
      { mode: "monthly", label: "du 1er au 30 novembre 2026" },
      { mode: "semimonthly", label: "du 16 au 30 novembre 2026" },
    ]);
  });

  it("sans rythme compté, aucune période", () => {
    expect(viewWith([]).periods).toEqual([]);
  });
});
