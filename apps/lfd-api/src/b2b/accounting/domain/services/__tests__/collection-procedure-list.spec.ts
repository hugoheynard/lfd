import { addDays } from "@lfd/contracts";
import { EVERY_DAY_CHECKED } from "./bank-return-check-fixtures.js";

import { CollectionProcedureNotFoundError } from "../../errors/collection-errors.js";
import { parseProcedureId, procedureIdOf } from "../collection-procedure-id.js";
import {
  procedureRowsOf,
  type ClosureToCome,
  type ListedBatch,
  type ProcedureListInput,
} from "../collection-procedure-list.js";
import { deadlinePassed, depositWarnings } from "../collection-procedure-warnings.js";

/**
 * La liste des procédures (§ 11), pure. Les clôtures sont écrites en absolu
 * et ne sont comparées qu'entre elles ; « aujourd'hui » est donné, et chaque
 * jour comparé à lui en est dérivé.
 */

const TODAY = "2026-10-23";
const NOW = { day: TODAY, time: "11:00" };
const OCT = new Date("2026-09-30T22:00:00.000Z");
const NOV = new Date("2026-10-31T23:00:00.000Z");
const SEP = new Date("2026-08-31T22:00:00.000Z");

function batch(id: string, closesAt: Date, over: Partial<ListedBatch> = {}): ListedBatch {
  return {
    id,
    scheme: "CORE",
    status: "constituted",
    cycleClosesAt: closesAt.toISOString(),
    requestedCollectionDay: addDays(TODAY, 8),
    depositDeadline: { day: addDays(TODAY, 6), time: "16:00" },
    pendingReturnCount: 0,
    checkedDays: EVERY_DAY_CHECKED,
    constitutedDay: TODAY,
    unmandatedCount: 0,
    periodLabel: "du 1er au 30 septembre 2026",
    payerModes: ["monthly"],
    ...over,
  };
}

function closure(closesAt: Date, deadlineDay: string | null): ClosureToCome {
  return {
    closesAt,
    periodLabel: "période",
    modes: ["monthly"],
    collectionDay: addDays(TODAY, 20),
    depositDeadline: deadlineDay === null ? null : { day: deadlineDay, time: "16:00" },
  };
}

function input(over: Partial<ProcedureListInput> = {}): ProcedureListInput {
  return {
    legalEntityId: "le1",
    now: NOW,
    accounts: { state: "done", toExportCount: 0 },
    mandates: { state: "done", toExportCount: 0 },
    batches: [],
    missed: [],
    toPrepare: null,
    upcoming: [],
    closedSince: null,
    ...over,
  };
}

describe("procedureRowsOf — ouvertes, à venir, closes", () => {
  it("une ligne par clôture, même avec un lot par schéma", () => {
    const rows = procedureRowsOf(
      input({ batches: [batch("core", OCT), batch("b2b", OCT, { scheme: "B2B" })] }),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.batches.map((b) => b.id)).toEqual(["core", "b2b"]);
    expect(rows[0]).toMatchObject({ phase: "open", stage: "file" });
  });

  it("la clôture à préparer n'est pas doublée par la même clôture à venir", () => {
    const rows = procedureRowsOf(
      input({ toPrepare: closure(OCT, addDays(TODAY, 3)), upcoming: [closure(OCT, null)] }),
    );

    expect(rows.map((row) => [row.id, row.phase])).toEqual([["le1~2026-10-01", "open"]]);
  });

  it("tous ses lots annulés : la dernière clôture redevient à préparer", () => {
    const rows = procedureRowsOf(
      input({
        batches: [batch("x", OCT, { status: "cancelled" })],
        toPrepare: closure(OCT, addDays(TODAY, 3)),
      }),
    );

    expect(rows[0]).toMatchObject({ phase: "open", stage: "file", followed: { id: "x" } });
    expect(rows[0]?.depositDeadline?.day).toBe(addDays(TODAY, 3));
  });

  it("une clôture ancienne abandonnée est close", () => {
    const rows = procedureRowsOf(
      input({ batches: [batch("x", SEP, { status: "cancelled" })], closedSince: "2026-07-01" }),
    );

    expect(rows[0]).toMatchObject({ phase: "closed", stage: "closed" });
  });

  it("trie : à déposer par limite, puis les déposées suivies, puis les closes (récente d'abord)", () => {
    const rows = procedureRowsOf(
      input({
        batches: [
          batch("watched", OCT, {
            status: "deposited",
            requestedCollectionDay: addDays(TODAY, 1),
          }),
          batch("old", SEP, { status: "deposited", requestedCollectionDay: addDays(TODAY, -40) }),
          batch("older", new Date("2026-07-31T22:00:00.000Z"), {
            status: "deposited",
            requestedCollectionDay: addDays(TODAY, -70),
          }),
        ],
        upcoming: [closure(NOV, addDays(TODAY, 15))],
        closedSince: "2026-07-01",
      }),
    );

    expect(rows.map((row) => row.id)).toEqual([
      "le1~2026-11-01",
      "le1~2026-10-01",
      "le1~2026-09-01",
      "le1~2026-08-01",
    ]);
    expect(rows[1]?.stage).toBe("returns");
  });

  it("les closes d'avant `closedSince` ne sont pas listées, ni aucune sans lui", () => {
    const old = batch("old", SEP, { status: "deposited", requestedCollectionDay: "2026-09-08" });

    expect(procedureRowsOf(input({ batches: [old] }))).toEqual([]);
    expect(procedureRowsOf(input({ batches: [old], closedSince: "2026-09-02" }))).toEqual([]);
  });

  it("à venir : l'étape est celle des onglets de l'entité qui attendent", () => {
    const rows = procedureRowsOf(
      input({
        accounts: { state: "to_do", toExportCount: 2 },
        mandates: { state: "locked", toExportCount: 1 },
        upcoming: [closure(NOV, addDays(TODAY, 15))],
      }),
    );

    expect(rows[0]).toMatchObject({ phase: "upcoming", stage: "accounts" });
    expect(rows[0]?.warnings).toEqual([
      { code: "accounts_to_export", count: 2 },
      { code: "mandates_to_export", count: 1 },
    ]);
  });

  it("préparé la veille de sa limite : la marge étroite est dite", () => {
    const rows = procedureRowsOf(
      input({
        batches: [batch("b", OCT, { depositDeadline: { day: addDays(TODAY, 1), time: "16:00" } })],
      }),
    );

    // TODAY est un vendredi : le lendemain est un samedi, aucun jour ouvré avant la limite.
    expect(rows[0]?.warnings).toEqual([{ code: "tight_deposit_margin", count: 0 }]);
  });
});

describe("les avertissements de dépôt", () => {
  it("une limite passée l'emporte sur la marge, à l'heure près", () => {
    const deadline = { day: TODAY, time: "10:59" };

    expect(deadlinePassed(deadline, NOW)).toBe(true);
    expect(deadlinePassed({ day: TODAY, time: "11:00" }, NOW)).toBe(false);
    expect(depositWarnings({ fromDay: TODAY, deadline }, NOW)).toEqual([
      { code: "deadline_passed", count: null },
    ]);
  });
});

describe("l'identifiant d'une procédure", () => {
  it("l'entité et le jour de Paris de la clôture, aller et retour", () => {
    const id = procedureIdOf("le_1", OCT);

    expect(id).toBe("le_1~2026-10-01");
    expect(parseProcedureId(id)).toEqual({ legalEntityId: "le_1", closureDay: "2026-10-01" });
  });

  it.each(["", "le1", "~2026-10-01", "le1~2026-10", "le1~demain"])(
    "refuse (404) l'adresse « %s »",
    (raw) => {
      expect(() => parseProcedureId(raw)).toThrow(CollectionProcedureNotFoundError);
    },
  );
});
