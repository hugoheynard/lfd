import { addDays, type CollectionProcedureListView } from "@lfd/contracts";

import { LegalEntityNotFoundError } from "../../../domain/errors/accounting-errors.js";
import type { PayerBillingModesReader } from "../../../domain/ports/payer-billing-modes.reader.js";
import { NOW, accountExportWorld } from "../../commands/__tests__/account-bank-export-doubles.js";
import {
  OneEntity,
  bankExportWorld,
  bankMandate,
  entityRecord,
} from "../../commands/__tests__/mandate-bank-export-doubles.js";
import {
  FixedModeDates,
  FixedPayerModes,
  weeklySince2026,
} from "../../commands/__tests__/monthly-invoice-doubles.js";
import { FixedInvoicePeriods } from "../../services/__tests__/issued-invoice-doubles.js";
import { FixedBatches, PendingReturns, TODAY, stored } from "./collection-procedure-doubles.js";
import { activePayer, countingOf, signedMandate } from "./counted-payers-doubles.js";
import { ListCollectionProceduresQuery } from "../collection-procedure-queries.js";
import { ListCollectionProceduresHandler } from "../list-collection-procedures.handler.js";

/**
 * La liste des procédures (§ 11) : une ligne par clôture, calculée par les
 * règles de la procédure. `NOW` est fixe (vendredi 23 octobre 2026) : la
 * dernière clôture mensuelle est le 1er octobre, la prochaine le 1er novembre.
 * Les jours des lots sont RELATIFS à l'horloge fixe.
 */

const CUTOFF = { businessDaysBefore: 1, time: "16:00" };

function world(payerModes: PayerBillingModesReader = new FixedPayerModes(), payers: string[] = []) {
  const accounts = accountExportWorld();
  const mandates = bankExportWorld();
  const batches = new FixedBatches();
  const returns = new PendingReturns();
  const entity = new OneEntity({ ...entityRecord(), depositCutoff: CUTOFF });
  const counting = countingOf(
    payers.map((id) => activePayer(id)),
    payers.map((id) => signedMandate(entity.record.id, id)),
  );
  const handler = new ListCollectionProceduresHandler(
    entity,
    accounts.accounts,
    accounts.fingerprints,
    mandates.mandates,
    mandates.imported,
    mandates.reader,
    batches,
    returns,
    new FixedModeDates(),
    payerModes,
    new FixedInvoicePeriods(new Map()),
    counting.standings,
    counting.mandates,
    accounts.clock,
  );
  const id = entity.record.id;
  const list = (includeClosed = false, entityId = id): Promise<CollectionProcedureListView> =>
    handler.execute(new ListCollectionProceduresQuery(entityId, includeClosed));
  return { id, entity, mandates, batches, returns, list };
}

describe("ListCollectionProceduresHandler — la liste des procédures", () => {
  it("sans lot : la dernière clôture à préparer, puis la prochaine du mensuel", async () => {
    const w = world();

    const view = await w.list();

    expect(view.today).toBe(TODAY);
    expect(view.rows.map((row) => [row.id, row.phase, row.stage])).toEqual([
      [`${w.id}~2026-10-01`, "open", "file"],
      [`${w.id}~2026-11-01`, "upcoming", "file"],
    ]);
    expect(view.rows[0]?.warnings).toContainEqual({ code: "deadline_passed", count: null });
    expect(view.rows[1]?.modes).toEqual(["monthly"]);
    expect(view.rows[1]?.warnings).toEqual([]);
  });

  it("limite non réglée : chaque ligne à venir le dit", async () => {
    const w = world();
    w.entity.record = { ...w.entity.record, depositCutoff: null };

    const view = await w.list();

    expect(view.rows.every((row) => row.depositDeadline === null)).toBe(true);
    expect(view.rows[1]?.warnings).toEqual([{ code: "deadline_not_set", count: null }]);
  });

  it("un lot à déposer : sa ligne le suit, et avertit des mandats de l'entité à exporter", async () => {
    const w = world();
    w.mandates.mandates.exportable = [bankMandate("m1")];
    w.batches.batches = [stored("b1", { unmandatedCompanies: ["Café"] })];

    const view = await w.list();
    const row = view.rows[0];

    expect(row).toMatchObject({
      id: `${w.id}~2026-10-01`,
      phase: "open",
      stage: "mandates",
      followedBatchId: "b1",
      deposited: false,
      batches: [{ id: "b1", scheme: "B2B", status: "constituted" }],
    });
    expect(row?.warnings).toEqual(
      expect.arrayContaining([
        { code: "mandates_to_export", count: 1 },
        { code: "unmandated_debtors", count: 1 },
      ]),
    );
  });

  it("un déposé suivi passe après ce qui reste à déposer ; une close n'est listée que sur demande", async () => {
    const w = world();
    w.batches.batches = [
      stored("watched", {
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: addDays(TODAY, -1),
      }),
      stored("closed", {
        cycleClosesAt: "2026-08-31T22:00:00.000Z",
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: addDays(TODAY, -40),
      }),
    ];
    w.returns.pending.set("watched", 2);

    const open = await w.list();
    const all = await w.list(true);

    expect(open.rows.map((row) => row.id)).toEqual([`${w.id}~2026-11-01`, `${w.id}~2026-10-01`]);
    expect(open.rows[1]).toMatchObject({ stage: "returns", deposited: true });
    expect(open.rows[1]?.warnings).toContainEqual({ code: "pending_returns", count: 2 });
    expect(all.closedSince).toBe(addDays(TODAY, -92));
    expect(all.rows.at(-1)).toMatchObject({
      id: `${w.id}~2026-09-01`,
      phase: "closed",
      stage: "closed",
      warnings: [],
    });
  });

  it("un rythme suivi a sa prochaine clôture ; un rythme sans client n'en a pas", async () => {
    const w = world(weeklySince2026("p1"), ["p1"]);

    const view = await w.list();
    const upcoming = view.rows.filter((row) => row.phase === "upcoming");

    expect(upcoming.map((row) => row.modes)).toEqual([["weekly"], ["monthly"]]);
  });

  it("refuse (404) une entité inconnue", async () => {
    const w = world();

    await expect(w.list(false, "ailleurs")).rejects.toThrow(LegalEntityNotFoundError);
  });
});
