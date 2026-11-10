import { addDays } from "@lfd/contracts";
import { EVERY_DAY_CHECKED } from "./bank-return-check-fixtures.js";

import {
  procedureRowsOf,
  type ClosureToCome,
  type ListedBatch,
  type ProcedureListInput,
} from "../collection-procedure-list.js";

/**
 * La colonne « Commandes » (Hugo, 2026-10-24). Les clôtures sont écrites en
 * absolu et ne sont comparées qu'entre elles ; « aujourd'hui » est donné.
 */

const TODAY = "2026-10-23";
const SEP = new Date("2026-08-31T22:00:00.000Z");
const OCT = new Date("2026-09-30T22:00:00.000Z");
const NOV = new Date("2026-10-31T23:00:00.000Z");

function batch(id: string, over: Partial<ListedBatch> = {}): ListedBatch {
  return {
    id,
    scheme: "CORE",
    status: "constituted",
    cycleClosesAt: OCT.toISOString(),
    requestedCollectionDay: addDays(TODAY, 8),
    depositDeadline: { day: addDays(TODAY, 6), time: "16:00" },
    pendingReturnCount: 0,
    checkedDays: EVERY_DAY_CHECKED,
    remittanceSigned: true,
    constitutedDay: TODAY,
    unmandatedCount: 0,
    periodLabel: "période",
    payerModes: ["monthly"],
    orderCount: 0,
    ...over,
  };
}

function closure(closesAt: Date): ClosureToCome {
  return {
    closesAt,
    periodLabel: "période",
    modes: ["monthly"],
    collectionDay: addDays(TODAY, 20),
    depositDeadline: { day: addDays(TODAY, 18), time: "16:00" },
  };
}

function input(over: Partial<ProcedureListInput> = {}): ProcedureListInput {
  return {
    legalEntityId: "le1",
    now: { day: TODAY, time: "11:00" },
    accounts: { state: "done", toExportCount: 0 },
    mandates: { state: "done", toExportCount: 0 },
    batches: [],
    missed: [],
    toPrepare: null,
    upcoming: [],
    closedSince: null,
    candidateOrderCounts: new Map(),
    ...over,
  };
}

function countOf(rows: ReturnType<typeof procedureRowsOf>, id: string): number | null | undefined {
  return rows.find((row) => row.id === id)?.orderCount;
}

describe("procedureRowsOf — la colonne « Commandes »", () => {
  it("une procédure avec lots : la somme des commandes de ses lots CORE et B2B", () => {
    const rows = procedureRowsOf(
      input({
        batches: [batch("core", { orderCount: 7 }), batch("b2b", { scheme: "B2B", orderCount: 3 })],
        candidateOrderCounts: new Map([["2026-10-01", 99]]),
      }),
    );

    expect(countOf(rows, "le1~2026-10-01")).toBe(10);
  });

  it("un lot annulé ou rejeté ne compte plus ses commandes", () => {
    const rows = procedureRowsOf(
      input({
        batches: [
          batch("live", { orderCount: 4 }),
          batch("gone", { scheme: "B2B", status: "cancelled", orderCount: 6 }),
        ],
      }),
    );

    expect(countOf(rows, "le1~2026-10-01")).toBe(4);
  });

  it("sans lot : les commandes candidates de sa clôture", () => {
    const rows = procedureRowsOf(
      input({
        toPrepare: closure(OCT),
        upcoming: [closure(NOV)],
        candidateOrderCounts: new Map([
          ["2026-10-01", 12],
          ["2026-11-01", 5],
        ]),
      }),
    );

    expect(countOf(rows, "le1~2026-10-01")).toBe(12);
    expect(countOf(rows, "le1~2026-11-01")).toBe(5);
  });

  it("tous ses lots annulés : redevenue à préparer, elle compte ses candidates", () => {
    const rows = procedureRowsOf(
      input({
        batches: [batch("gone", { status: "cancelled", orderCount: 6 })],
        toPrepare: closure(OCT),
        candidateOrderCounts: new Map([["2026-10-01", 2]]),
      }),
    );

    expect(countOf(rows, "le1~2026-10-01")).toBe(2);
  });

  it("une clôture sans compte calculé (manquée, à venir lointaine) : null", () => {
    const rows = procedureRowsOf(input({ missed: [closure(SEP)], upcoming: [closure(NOV)] }));

    expect(countOf(rows, "le1~2026-09-01")).toBeNull();
    expect(countOf(rows, "le1~2026-11-01")).toBeNull();
  });
});
