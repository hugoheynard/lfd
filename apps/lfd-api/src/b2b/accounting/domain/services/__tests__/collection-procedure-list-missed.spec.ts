import { addDays } from "@lfd/contracts";
import { EVERY_DAY_CHECKED } from "./bank-return-check-fixtures.js";

import {
  procedureRowsOf,
  type ClosureToCome,
  type ListedBatch,
  type ProcedureListInput,
} from "../collection-procedure-list.js";

/**
 * Les clôtures manquées dans la table (§ 11, Hugo 2026-10-23). Les clôtures
 * sont écrites en absolu et ne sont comparées qu'entre elles ; chaque jour
 * comparé à « aujourd'hui » en est dérivé.
 */

const TODAY = "2026-10-23";
const AUG = new Date("2026-07-31T22:00:00.000Z");
const SEP = new Date("2026-08-31T22:00:00.000Z");
const OCT = new Date("2026-09-30T22:00:00.000Z");

function closure(closesAt: Date, deadlineDay: string): ClosureToCome {
  return {
    closesAt,
    periodLabel: "période",
    modes: ["monthly"],
    collectionDay: addDays(deadlineDay, 2),
    depositDeadline: { day: deadlineDay, time: "16:00" },
  };
}

function cancelled(id: string, closesAt: Date): ListedBatch {
  return {
    id,
    scheme: "CORE",
    status: "cancelled",
    cycleClosesAt: closesAt.toISOString(),
    requestedCollectionDay: null,
    depositDeadline: null,
    pendingReturnCount: 0,
    checkedDays: EVERY_DAY_CHECKED,
    remittanceSigned: true,
    constitutedDay: addDays(TODAY, -40),
    unmandatedCount: 0,
    periodLabel: "période",
    payerModes: ["monthly"],
  };
}

function input(over: Partial<ProcedureListInput> = {}): ProcedureListInput {
  return {
    legalEntityId: "le1",
    now: { day: TODAY, time: "11:00" },
    accounts: { state: "done", toExportCount: 0 },
    mandates: { state: "to_do", toExportCount: 2 },
    batches: [],
    missed: [],
    toPrepare: closure(OCT, addDays(TODAY, -10)),
    upcoming: [],
    closedSince: null,
    ...over,
  };
}

describe("procedureRowsOf — les clôtures manquées", () => {
  it("en tête, la plus ancienne d'abord, avant la clôture à préparer", () => {
    const rows = procedureRowsOf(
      input({ missed: [closure(SEP, addDays(TODAY, -40)), closure(AUG, addDays(TODAY, -70))] }),
    );

    expect(rows.map((row) => [row.id, row.phase])).toEqual([
      ["le1~2026-08-01", "missed"],
      ["le1~2026-09-01", "missed"],
      ["le1~2026-10-01", "open"],
    ]);
  });

  it("ne porte que l'avertissement de la clôture manquée, à l'onglet du fichier", () => {
    const [row] = procedureRowsOf(input({ missed: [closure(SEP, addDays(TODAY, -40))] }));

    expect(row).toMatchObject({ phase: "missed", stage: "file", batches: [], followed: null });
    expect(row?.warnings).toEqual([{ code: "missed_closure", count: null }]);
  });

  it("aucune ligne manquée quand rien n'est manqué", () => {
    const rows = procedureRowsOf(input());

    expect(rows.some((row) => row.phase === "missed")).toBe(false);
  });

  it("une manquée dont les lots ont été annulés reste manquée, avec ses lots", () => {
    const rows = procedureRowsOf(
      input({
        missed: [closure(SEP, addDays(TODAY, -40))],
        batches: [cancelled("old", SEP)],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: "le1~2026-09-01", phase: "missed" });
    expect(rows[0]?.batches.map((batch) => batch.id)).toEqual(["old"]);
  });
});
