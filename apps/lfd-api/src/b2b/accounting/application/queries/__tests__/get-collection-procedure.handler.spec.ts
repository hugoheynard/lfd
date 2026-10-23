import { addDays } from "@lfd/contracts";

import { CollectionBatchNotFoundError } from "../../../domain/errors/collection-errors.js";
import { debitedAccount } from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { ExportAccountsForBankCommand } from "../../commands/export-accounts-for-bank.command.js";
import { ExportMandatesForBankCommand } from "../../commands/export-mandates-for-bank.command.js";
import { NOW, accountExportWorld } from "../../commands/__tests__/account-bank-export-doubles.js";
import {
  bankExportWorld,
  bankMandate,
} from "../../commands/__tests__/mandate-bank-export-doubles.js";
import {
  FixedModeDates,
  FixedPayerModes,
} from "../../commands/__tests__/monthly-invoice-doubles.js";
import { FixedInvoicePeriods } from "../../services/__tests__/issued-invoice-doubles.js";
import {
  FixedBatches,
  LAST_CLOSURE,
  PendingReturns,
  TODAY,
  stored,
} from "./collection-procedure-doubles.js";
import { GetCollectionProcedureQuery } from "../collection-procedure-queries.js";
import { GetCollectionProcedureHandler } from "../get-collection-procedure.handler.js";

/**
 * La lecture d'état de la procédure (S1) : les quatre onglets calculés depuis
 * les exports, les lots et les retours, sans rien stocker. Les jours des lots
 * sont RELATIFS à l'horloge fixe : la règle du § 4.3 les compare à
 * aujourd'hui.
 */

function world() {
  const accounts = accountExportWorld();
  const mandates = bankExportWorld();
  const batches = new FixedBatches();
  const returns = new PendingReturns();
  const handler = new GetCollectionProcedureHandler(
    accounts.entities,
    accounts.accounts,
    accounts.fingerprints,
    mandates.mandates,
    mandates.imported,
    mandates.reader,
    batches,
    returns,
    new FixedModeDates(),
    new FixedPayerModes(),
    new FixedInvoicePeriods(new Map()),
    accounts.clock,
  );
  const read = (batchId: string | null = null, closureDay: string | null = null) =>
    handler.execute(new GetCollectionProcedureQuery("le1", batchId, closureDay));
  return { accounts, mandates, batches, returns, read };
}

describe("la procédure de prélèvement — la lecture d'état", () => {
  it("des comptes à exporter : onglet 1 à faire, onglet 2 verrouillé, arrivée sur l'onglet 1", async () => {
    const w = world();
    w.accounts.accounts.exportable = [debitedAccount("a")];

    const view = await w.read();

    expect(view.accounts).toMatchObject({ state: "to_do", toExportCount: 1 });
    expect(view.mandates.state).toBe("locked");
    expect(view.arrivalStep).toBe("accounts");
  });

  it("un export de comptes en vol : en attente, l'onglet 2 reste verrouillé", async () => {
    const w = world();
    w.accounts.accounts.exportable = [debitedAccount("a")];
    await w.accounts.prepare.execute(new ExportAccountsForBankCommand("le1", "s"));

    const view = await w.read();

    expect(view.accounts).toMatchObject({ state: "waiting", inFlightCount: 1 });
    expect(view.mandates.state).toBe("locked");
  });

  it("un export de mandats non importé : l'onglet 2 attend « Marquer importé »", async () => {
    const w = world();
    w.mandates.mandates.exportable = [bankMandate("m1")];
    await w.mandates.exportCommand.execute(new ExportMandatesForBankCommand("le1", false, "s"));

    const view = await w.read();

    expect(view.mandates).toMatchObject({ state: "waiting", awaitingImport: true });
    expect(view.arrivalStep).toBe("mandates");
  });

  it("onglet 3 : avertit des mandats non importés de l'entité, sans se verrouiller (P2)", async () => {
    const w = world();
    w.mandates.mandates.exportable = [bankMandate("m1"), bankMandate("m2")];
    w.batches.batches = [stored("b1")];

    const view = await w.read();

    expect(view.file).toMatchObject({
      state: "to_do",
      reason: "to_deposit",
      mandatesNotImportedCount: 2,
    });
    expect(view.followed?.id).toBe("b1");
    // Un lot sans payeur rattaché ne prête aucun rythme : rien n'est inventé.
    expect(view.followed?.payerModes).toEqual([]);
  });

  it("le lot à la limite la plus proche est suivi, et tous les lots ouverts sont listés", async () => {
    const w = world();
    w.batches.batches = [
      stored("late", { depositDeadline: { day: addDays(TODAY, 9), time: "13:45" } }),
      stored("soon", {
        scheme: "CORE",
        depositDeadline: { day: addDays(TODAY, 3), time: "14:45" },
      }),
    ];

    const view = await w.read();

    expect(view.followed?.id).toBe("soon");
    expect(view.openBatches.map((batch) => batch.id)).toEqual(["soon", "late"]);
  });

  it("préparé la veille de sa limite : l'avertissement compte le jour ouvré qui reste", async () => {
    const w = world();
    const tomorrow = addDays(TODAY, 1);
    w.batches.batches = [stored("b1", { depositDeadline: { day: tomorrow, time: "13:45" } })];

    const view = await w.read();

    // NOW est un vendredi : le lendemain est un samedi, aucun jour ouvré avant la limite.
    expect(view.file.tightDepositMargin).toBe(0);
  });

  it("la dernière clôture sans lot vivant : l'onglet 3 propose de préparer", async () => {
    const w = world();
    w.batches.batches = [stored("x", { status: "cancelled", cancelledAt: NOW.toISOString() })];

    const view = await w.read();

    expect(view.followed).toBeNull();
    expect(view.toPrepare?.closesAt).toBe(LAST_CLOSURE);
    expect(view.file.reason).toBe("to_prepare");
  });

  it("un lot déposé avec un retour en suspens : l'onglet 4 est à faire", async () => {
    const w = world();
    w.batches.batches = [
      stored("dep", {
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: addDays(TODAY, -2),
      }),
    ];
    w.returns.pending.set("dep", 1);

    const view = await w.read();

    expect(view.file.state).toBe("done");
    expect(view.returns).toMatchObject({
      state: "to_do",
      reason: "pending_returns",
      pendingReturnCount: 1,
    });
  });

  it("un lot annulé, demandé par l'adresse : il est dit, avec celui préparé de nouveau", async () => {
    const w = world();
    w.batches.batches = [
      stored("x", { status: "cancelled", cancelledAt: NOW.toISOString() }),
      stored("again"),
    ];

    const view = await w.read("x");

    expect(view.followed?.id).toBe("x");
    expect(view.file.reason).toBe("cancelled");
    expect(view.replacementBatchId).toBe("again");
    expect(view.returns.state).toBe("locked");
  });

  it("refuse (404) un lot que l'entité n'a pas", async () => {
    const w = world();

    await expect(w.read("ailleurs")).rejects.toThrow(CollectionBatchNotFoundError);
  });

  it("ouverte depuis la liste : suit le lot de SA clôture, et nomme sa procédure", async () => {
    const w = world();
    w.batches.batches = [
      stored("old", {
        cycleClosesAt: "2026-08-31T22:00:00.000Z",
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: addDays(TODAY, -40),
      }),
      stored("current"),
    ];

    const view = await w.read(null, "2026-09-01");

    expect(view.followed).toMatchObject({ id: "old", procedureId: "le1~2026-09-01" });
    expect(view.file.reason).toBe("deposited");
  });

  it("une procédure à venir ne propose pas de préparer la dernière clôture", async () => {
    const w = world();

    const latest = await w.read();
    const upcoming = await w.read(null, "2026-11-01");

    expect(latest.toPrepare).toMatchObject({ procedureId: "le1~2026-10-01" });
    expect(upcoming.toPrepare).toBeNull();
    expect(upcoming.followed).toBeNull();
    expect(upcoming.file.reason).toBe("no_batch");
  });
});
