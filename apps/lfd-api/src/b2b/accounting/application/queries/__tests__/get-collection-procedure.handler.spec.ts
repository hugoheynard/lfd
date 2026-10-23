import { addDays, instantToLocal, type CollectionExclusionView } from "@lfd/contracts";

import { CollectionBatchNotFoundError } from "../../../domain/errors/collection-errors.js";
import {
  CollectionBatchReader,
  type StoredBatchFile,
  type StoredBatchView,
} from "../../../domain/ports/collection-batch.reader.js";
import {
  CollectionReturnsReader,
  type CollectionReturnRow,
} from "../../../domain/ports/collection-returns.reader.js";
import { debitedAccount } from "../../../domain/services/__tests__/account-for-bank-export.fixture.js";
import type { BatchCsvLine } from "../../../domain/services/collection-batch-csv.js";
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
import { GetCollectionProcedureQuery } from "../collection-procedure-queries.js";
import { GetCollectionProcedureHandler } from "../get-collection-procedure.handler.js";

/**
 * La lecture d'état de la procédure (S1) : les quatre onglets calculés depuis
 * les exports, les lots et les retours, sans rien stocker. Les jours des lots
 * sont RELATIFS à l'horloge fixe : la règle du § 4.3 les compare à
 * aujourd'hui.
 */

const TODAY = instantToLocal(NOW).day;
/** La dernière clôture mensuelle avant `NOW` (le 1er du mois, minuit de Paris). */
const LAST_CLOSURE = "2026-09-30T22:00:00.000Z";

function stored(id: string, over: Partial<StoredBatchView> = {}): StoredBatchView {
  return {
    id,
    scheme: "B2B",
    cycleStartsAt: "2026-08-31T22:00:00.000Z",
    cycleClosesAt: LAST_CLOSURE,
    periodLabel: "du 1er au 30 septembre 2026",
    status: "constituted",
    constitutedAt: NOW.toISOString(),
    constitutedBy: "staff",
    depositedAt: null,
    cancelledAt: null,
    lineCount: 1,
    orderCount: 1,
    totalCents: 10_000,
    unmandatedCompanies: [],
    depositable: true,
    requestedCollectionDay: addDays(TODAY, 10),
    postponedFromDay: null,
    depositDeadline: { day: addDays(TODAY, 6), time: "13:45" },
    lines: [],
    payerRefs: [],
    ...over,
  };
}

class FixedBatches extends CollectionBatchReader {
  batches: StoredBatchView[] = [];
  list(): Promise<readonly StoredBatchView[]> {
    return Promise.resolve(this.batches);
  }
  exclusions(): Promise<readonly CollectionExclusionView[]> {
    return Promise.resolve([]);
  }
  file(): Promise<StoredBatchFile | null> {
    return Promise.resolve(null);
  }
  auditLines(): Promise<readonly BatchCsvLine[]> {
    return Promise.resolve([]);
  }
}

class PendingReturns extends CollectionReturnsReader {
  readonly pending = new Map<string, number>();
  ofBatch(batchId: string): Promise<readonly CollectionReturnRow[]> {
    const count = this.pending.get(batchId) ?? 0;
    return Promise.resolve(
      Array.from({ length: count }, (_, index) => pendingReturn(batchId, index)),
    );
  }
  ofPayer(): Promise<readonly CollectionReturnRow[]> {
    return Promise.resolve([]);
  }
}

function pendingReturn(batchId: string, index: number): CollectionReturnRow {
  return {
    id: `ret_${String(index)}`,
    endToEndId: `e2e_${String(index)}`,
    batchId,
    lineRank: 1,
    scheme: "B2B",
    cycleClosesAt: new Date(LAST_CLOSURE),
    debtorCompanyId: "cmp",
    debtorName: "Café",
    mandateId: "m1",
    mandateReference: "RUM-m1",
    kind: "reject",
    reasonCode: "AM04",
    reasonLabel: null,
    returnedOn: TODAY,
    amountCents: 10_000,
    feeCents: null,
    source: "manual",
    recordedAt: NOW,
    resolution: "pending",
    resolutionNote: null,
    resolvedAt: null,
  };
}

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
  const read = (batchId: string | null = null) =>
    handler.execute(new GetCollectionProcedureQuery("le1", batchId));
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
});
