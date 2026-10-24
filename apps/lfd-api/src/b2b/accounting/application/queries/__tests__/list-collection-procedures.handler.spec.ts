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
import {
  FixedBatches,
  FixedBankReturnChecks,
  FixedBatchAttestations,
  FixedCoverage,
  PendingReturns,
  LAST_CLOSURE,
  TODAY,
  stored,
} from "./collection-procedure-doubles.js";
import { mandate, order } from "../../../domain/services/__tests__/collection-fixtures.js";
import {
  FakeCandidates,
  FakeMandates,
  Steps,
} from "../../commands/__tests__/collection-doubles.js";
import { assemblyReaders } from "../../commands/__tests__/collection-world.js";
import { activePayer, countingOf, signedMandate } from "./counted-payers-doubles.js";
import { ListCollectionProceduresQuery } from "../collection-procedure-queries.js";
import { ListCollectionProceduresHandler } from "../list-collection-procedures.handler.js";

/** La clôture du 1er août : la dernière que l'automatisme a tentée. */
const AUG_CLOSURE = "2026-07-31T22:00:00.000Z";

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
  const coverage = new FixedCoverage();
  const checks = new FixedBankReturnChecks();
  const attestations = new FixedBatchAttestations();
  const entity = new OneEntity({ ...entityRecord(), depositCutoff: CUTOFF });
  const counting = countingOf(
    payers.map((id) => activePayer(id)),
    payers.map((id) => signedMandate(entity.record.id, id)),
  );
  const assembly = { candidates: new FakeCandidates(new Steps()), mandates: new FakeMandates() };
  const handler = new ListCollectionProceduresHandler(
    entity,
    accounts.accounts,
    accounts.fingerprints,
    mandates.mandates,
    mandates.known,
    mandates.reader,
    batches,
    returns,
    new FixedModeDates(),
    payerModes,
    new FixedInvoicePeriods(new Map()),
    counting.standings,
    counting.mandates,
    counting.lot,
    coverage,
    accounts.clock,
    checks,
    attestations,
    assemblyReaders(assembly, payerModes),
  );
  const id = entity.record.id;
  const list = (includeClosed = false, entityId = id): Promise<CollectionProcedureListView> =>
    handler.execute(new ListCollectionProceduresQuery(entityId, includeClosed));
  return { id, entity, assembly, mandates, batches, returns, coverage, checks, attestations, list };
}

describe("ListCollectionProceduresHandler — la liste des procédures", () => {
  it("sans lot : la prochaine du mensuel, puis la dernière clôture à préparer", async () => {
    const w = world();

    const view = await w.list();

    expect(view.today).toBe(TODAY);
    expect(view.rows.map((row) => [row.id, row.phase, row.stage])).toEqual([
      [`${w.id}~2026-11-01`, "upcoming", "file"],
      [`${w.id}~2026-10-01`, "open", "file"],
    ]);
    const open = view.rows.find((row) => row.phase === "open");
    const upcoming = view.rows.find((row) => row.phase === "upcoming");
    expect(open?.warnings).toContainEqual({ code: "deadline_passed", count: null });
    expect(upcoming?.modes).toEqual(["monthly"]);
    expect(upcoming?.warnings).toEqual([]);
  });

  it("limite non réglée : chaque ligne à venir le dit", async () => {
    const w = world();
    w.entity.record = { ...w.entity.record, depositCutoff: null };

    const view = await w.list();

    expect(view.rows.every((row) => row.depositDeadline === null)).toBe(true);
    expect(view.rows.find((row) => row.phase === "upcoming")?.warnings).toEqual([
      { code: "deadline_not_set", count: null },
    ]);
  });

  it("un lot à déposer : sa ligne le suit, et avertit des mandats de l'entité à exporter", async () => {
    const w = world();
    w.mandates.mandates.exportable = [bankMandate("m1")];
    w.batches.batches = [stored("b1", { unmandatedCompanies: ["Café"] })];

    const view = await w.list();
    const row = view.rows.find((candidate) => candidate.id === `${w.id}~2026-10-01`);

    expect(row).toMatchObject({
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

  it("un déposé suivi prend sa place par clôture décroissante ; une close n'est listée que sur demande", async () => {
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
    // La fenêtre du lot clos est attestée jour après jour : sans quoi il resterait suivi (P3).
    w.checks.attest(...Array.from({ length: 12 }, (_, index) => addDays(TODAY, -40 + index)));
    // Les deux remises signées attestées : sans quoi l'étape serait l'onglet 3 (P3).
    w.attestations.attest("watched");
    w.attestations.attest("closed");

    const open = await w.list();
    const all = await w.list(true);

    expect(open.rows.map((row) => row.id)).toEqual([`${w.id}~2026-11-01`, `${w.id}~2026-10-01`]);
    expect(open.rows[1]).toMatchObject({
      stage: "returns",
      deposited: true,
      signatureToAttest: false,
    });
    expect(open.rows[1]?.warnings).toContainEqual({ code: "pending_returns", count: 2 });
    expect(all.closedSince).toBe(addDays(TODAY, -92));
    expect(all.rows.at(-1)).toMatchObject({
      id: `${w.id}~2026-09-01`,
      phase: "closed",
      stage: "closed",
      warnings: [],
    });
  });

  it("un lot déposé dont la fenêtre a un jour sans contrôle attesté reste ouvert (P3)", async () => {
    const w = world();
    w.batches.batches = [
      stored("holed", {
        cycleClosesAt: "2026-08-31T22:00:00.000Z",
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: addDays(TODAY, -40),
      }),
    ];

    const open = await w.list();

    expect(open.rows.map((row) => row.id)).toContain(`${w.id}~2026-09-01`);
  });

  it("un rythme suivi a sa prochaine clôture ; un rythme sans client n'en a pas", async () => {
    const w = world(weeklySince2026("p1"), ["p1"]);

    const view = await w.list();
    const upcoming = view.rows.filter((row) => row.phase === "upcoming");

    expect(upcoming.map((row) => row.modes)).toEqual([["monthly"], ["weekly"]]);
    expect(upcoming[0]!.closesAt > upcoming[1]!.closesAt).toBe(true);
  });

  it("une clôture jamais tentée ni couverte par un lot : manquée, à sa place par clôture décroissante", async () => {
    const w = world();
    w.coverage.attempted = [new Date(AUG_CLOSURE)];

    const view = await w.list();

    expect(view.rows.map((row) => [row.id, row.phase])).toEqual([
      [`${w.id}~2026-11-01`, "upcoming"],
      [`${w.id}~2026-10-01`, "open"],
      [`${w.id}~2026-09-01`, "missed"],
    ]);
    expect(view.rows.find((row) => row.phase === "missed")?.warnings).toEqual([
      { code: "missed_closure", count: null },
    ]);
  });

  it("un lot vivant sur la dernière clôture la couvre : plus rien de manqué", async () => {
    const w = world();
    w.coverage.attempted = [new Date(AUG_CLOSURE)];
    w.coverage.lastLiveBatchClosesAt = new Date(LAST_CLOSURE);
    w.batches.batches = [stored("b1")];

    const view = await w.list();

    expect(view.rows.some((row) => row.phase === "missed")).toBe(false);
  });

  it("refuse (404) une entité inconnue", async () => {
    const w = world();

    await expect(w.list(false, "ailleurs")).rejects.toThrow(LegalEntityNotFoundError);
  });

  /** Hugo, 2026-10-23 : le code ne porte que les rythmes qui ont des clients. */
  it("le code d'une ligne : les rythmes de son lot, et sans lettre faute de client", async () => {
    const w = world();
    w.batches.batches = [stored("b1", { payerRefs: [{ payerCompanyId: "c1", invoiceId: null }] })];

    const view = await w.list();

    expect(view.rows.map((row) => [row.code, row.closureModes])).toEqual([
      ["PRL-261101", []],
      ["PRL-261001-M", ["monthly"]],
    ]);
  });

  it("une clôture à venir : les rythmes qui y closent ET ont des clients", async () => {
    const w = world(new FixedPayerModes(), ["c1"]);

    const view = await w.list();

    expect(view.rows.find((row) => row.phase === "upcoming")).toMatchObject({
      code: "PRL-261101-M",
      closureModes: ["monthly"],
    });
  });

  it("un déposé dont la remise n'est pas attestée signée : l'étape reste le fichier (P3)", async () => {
    const w = world();
    w.batches.batches = [
      stored("dep", {
        status: "deposited",
        depositedAt: NOW.toISOString(),
        requestedCollectionDay: addDays(TODAY, 1),
      }),
    ];

    const open = await w.list();

    expect(open.rows.find((row) => row.deposited)).toMatchObject({
      stage: "file",
      signatureToAttest: true,
    });
  });

  it("« Commandes » : un lot compte ses commandes, une clôture sans lot ses candidates", async () => {
    const w = world();
    w.assembly.candidates.orders = [order("c_port"), order("c_port")];
    w.assembly.mandates.mandates = [mandate("c_port", { creditorId: w.id })];

    const before = await w.list();
    w.batches.batches = [stored("b1", { orderCount: 9 })];
    const after = await w.list();

    const october = (view: CollectionProcedureListView) =>
      view.rows.find((row) => row.id === `${w.id}~2026-10-01`)?.orderCount;
    expect(october(before)).toBe(2);
    expect(october(after)).toBe(9);
  });
});
