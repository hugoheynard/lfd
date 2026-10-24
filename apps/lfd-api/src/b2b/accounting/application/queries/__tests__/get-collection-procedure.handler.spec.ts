import { addDays } from "@lfd/contracts";

import { CollectionBatchNotFoundError } from "../../../domain/errors/collection-errors.js";
import { debitedAccount } from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import { ExportAccountsForBankCommand } from "../../commands/export-accounts-for-bank.command.js";
import { ExportMandatesForBankCommand } from "../../commands/export-mandates-for-bank.command.js";
import { NOW } from "../../commands/__tests__/account-bank-export-doubles.js";
import { bankMandate } from "../../commands/__tests__/mandate-bank-export-doubles.js";
import { LAST_CLOSURE, TODAY, stored } from "./collection-procedure-doubles.js";
import { world } from "./collection-procedure-world.js";

/**
 * La lecture d'état de la procédure (S1) : les quatre onglets calculés depuis
 * les exports, les lots et les retours, sans rien stocker. Les jours des lots
 * sont RELATIFS à l'horloge fixe : la règle du § 4.3 les compare à
 * aujourd'hui. Le monde est partagé avec la suite des débiteurs (P4 révisé).
 */
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
    await w.mandates.exportCommand.execute(new ExportMandatesForBankCommand("le1", "s"));

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
    // La remise signée attestée : sans elle, l'onglet 3 attend (P3).
    w.attestations.attest("dep");

    const view = await w.read();

    expect(view.file.state).toBe("done");
    expect(view.returns).toMatchObject({
      state: "to_do",
      reason: "pending_returns",
      pendingReturnCount: 1,
    });
  });

  it("onglet 4 : les jours de la fenêtre sans contrôle sont nommés, celui d'aujourd'hui dit qui l'a fait", async () => {
    const w = world();
    const collectionDay = addDays(TODAY, -2);
    w.batches.batches = [
      stored("dep", {
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: collectionDay,
      }),
    ];
    w.checks.attest(TODAY);

    const view = await w.read();

    expect(view.returns.today).toBe(TODAY);
    expect(view.returns.todayCheck).toEqual({
      day: TODAY,
      at: NOW.toISOString(),
      byName: "Claire Compta",
    });
    expect(view.returns.missingCheckDays).not.toContain(TODAY);
    expect(view.returns.missingCheckDays[0]).toBe(collectionDay);
    expect(view.returns).toMatchObject({ state: "to_do", reason: "watching" });
  });

  it("onglet 4 : chaque jour arrivé attesté, aucun retour — en attente, et ses chiffres clés", async () => {
    const w = world();
    const collectionDay = addDays(TODAY, -2);
    w.batches.batches = [
      stored("dep", {
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: collectionDay,
      }),
    ];
    w.checks.attest(collectionDay, addDays(TODAY, -1), TODAY);

    const view = await w.read();

    expect(view.returns).toMatchObject({ state: "waiting", missingCheckDays: [] });
    expect(view.returns.figures).toEqual({
      lineCount: 0,
      pendingCount: 0,
      representedCount: 0,
      settledOtherwiseCount: 0,
      writtenOffCount: 0,
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
    w.attestations.attest("old");

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

  it("une clôture manquée : le détail la nomme et renvoie au lot de la dernière clôture", async () => {
    const w = world();
    w.coverage.attempted = [new Date("2026-07-31T22:00:00.000Z")];

    const missed = await w.read(null, "2026-09-01");
    const latest = await w.read(null, "2026-10-01");

    expect(missed.missed).toEqual({
      closesAt: "2026-08-31T22:00:00.000Z",
      periodLabel: "du 1er au 31 août 2026",
      latestProcedureId: "le1~2026-10-01",
      latestPeriodLabel: "du 1er au 30 septembre 2026",
    });
    expect(missed.toPrepare).toBeNull();
    expect(latest.missed).toBeNull();
    expect(latest.toPrepare).toMatchObject({ procedureId: "le1~2026-10-01" });
  });

  /** Hugo, 2026-10-23 : le code et « mutualisée » ne lisent que les rythmes qui ont des clients. */
  it("la procédure d'un lot : son code vient des clients du lot", async () => {
    const w = world();
    w.batches.batches = [stored("b1", { payerRefs: [{ payerCompanyId: "c1", invoiceId: null }] })];

    const view = await w.read("b1");

    expect(view.procedure).toMatchObject({ code: "PRL-261001-M", closureModes: ["monthly"] });
  });

  it("une procédure sans lot ni client : un code sans lettre", async () => {
    const w = world();

    const view = await w.read(null, "2026-11-01");

    expect(view.procedure).toMatchObject({ code: "PRL-261101", closureModes: [] });
  });
});
