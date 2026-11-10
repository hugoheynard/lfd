import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { ReturnableLine } from "../../../domain/entities/collection-return.js";
import {
  BankRejectionAfterCollectionDayError,
  BatchNotDepositedError,
  RejectedBatchHasReturnsError,
} from "../../../domain/errors/batch-bank-rejection-errors.js";
import { CollectionBatchLock } from "../../../domain/ports/collection-batch-lock.js";
import { ReturnableLinesReader } from "../../../domain/ports/returnable-lines.reader.js";
import {
  ENTITY_ID,
  STAFF_AUTHOR,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../deposit-collection-batch.command.js";
import { RecordCollectionBatchDownloadCommand } from "../record-collection-batch-download.command.js";
import { RejectCollectionBatchByBankCommand } from "../reject-collection-batch-by-bank.command.js";
import { RejectCollectionBatchByBankHandler } from "../reject-collection-batch-by-bank.handler.js";
import { FixedEntities, type Steps } from "./collection-doubles.js";
import { world } from "./collection-world.js";
import { sendAllQueued } from "./notice-doubles.js";

/**
 * « La banque a rejeté ce fichier » (plan `plan-lot-rejete-par-la-banque.md`) :
 * l'ordre des écritures est la règle — verrou, lecture, lot, PUIS arrêtés
 * (le déclencheur des arrêtés lit le lot enregistré), PUIS commandes.
 */

/** Le verrou du lot, journalisé dans les mêmes pas que les écritures. */
class StepBatchLock extends CollectionBatchLock {
  constructor(private readonly steps: Steps) {
    super();
  }
  lock(batchId: string): Promise<void> {
    this.steps.log.push(`lock:batch:${batchId}`);
    return Promise.resolve();
  }
}

/** Les retours enregistrés, par `EndToEndId` ; la lecture se journalise. */
class FixedReturned extends ReturnableLinesReader {
  readonly returned = new Set<string>();
  constructor(private readonly steps: Steps) {
    super();
  }
  lineOf(): Promise<ReturnableLine | null> {
    return Promise.resolve(null);
  }
  byEndToEndIds(): Promise<ReadonlyMap<string, ReturnableLine>> {
    return Promise.resolve(new Map());
  }
  alreadyReturned(ids: readonly string[]): Promise<ReadonlySet<string>> {
    this.steps.log.push("read:returns");
    return Promise.resolve(new Set(ids.filter((id) => this.returned.has(id))));
  }
}

async function depositedWorld() {
  const w = world();
  const placed = order("c_port");
  w.candidates.orders = [placed];
  w.mandates.mandates = [mandate("c_port")];
  const [id] = await w.constitute.execute(
    new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
  );
  const batchId = id ?? "";
  w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
  sendAllQueued(w.noticeStore, w.clock.now());
  await w.download.execute(new RecordCollectionBatchDownloadCommand(batchId, "staff_1"));
  await w.deposit.execute(new DepositCollectionBatchCommand(batchId, "staff_1"));
  const returned = new FixedReturned(w.steps);
  const reject = new RejectCollectionBatchByBankHandler(
    new StepBatchLock(w.steps),
    w.batches,
    returned,
    w.orders,
    w.statements,
    new FixedEntities(),
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  w.steps.log.length = 0;
  return { ...w, batchId, orderId: placed.orderId, returned, reject };
}

const REASON = "PSR1 : fichier refusé, schéma XML invalide";

describe("RejectCollectionBatchByBankHandler", () => {
  it("verrouille, lit les retours, écrit le lot AVANT d'annuler ses arrêtés", async () => {
    const w = await depositedWorld();

    await w.reject.execute(new RejectCollectionBatchByBankCommand(w.batchId, REASON, "staff_2"));

    expect(w.steps.log).toEqual([
      `lock:batch:${w.batchId}`,
      "read:returns",
      "save:batch:rejected_by_bank",
      `cancel:statements:${w.batchId}`,
    ]);
  });

  it("rend les commandes `due`, sans lot, et garde la trace du dépôt", async () => {
    const w = await depositedWorld();

    await w.reject.execute(
      new RejectCollectionBatchByBankCommand(w.batchId, ` ${REASON} `, "staff_2"),
    );

    const order = w.orders.saved.get(w.orderId)?.toPersistence();
    expect(order).toMatchObject({ state: "due", batchId: null, lineRank: null });
    const state = w.batches.saved.get(w.batchId)?.toPersistence();
    expect(state?.status).toBe("rejected_by_bank");
    expect(state?.deposited).not.toBeNull();
    expect(state?.rejected).toEqual({ at: w.clock.now(), staffId: "staff_2", reason: REASON });
  });

  it("journalise le rejet, puis l'annulation de chaque arrêté", async () => {
    const w = await depositedWorld();
    const before = w.events.factTypes().length;

    await w.reject.execute(new RejectCollectionBatchByBankCommand(w.batchId, REASON, "staff_2"));

    expect(w.events.factTypes().slice(before)).toEqual([
      "collection.batch_rejected_by_bank",
      "billing_statement.cancelled",
    ]);
    const fact = w.events.traced
      .map((event) => event.journalFact())
      .find((candidate) => candidate.type === "collection.batch_rejected_by_bank");
    expect(fact?.payload).toMatchObject({ reason: REASON, releasedOrderCount: 1 });
  });

  it("refuse quand une ligne a un retour : la remise est partie, rien n'est écrit", async () => {
    const w = await depositedWorld();
    const line = w.batches.saved.get(w.batchId)?.lines[0];
    w.returned.returned.add(line?.endToEndId ?? "");

    await expect(
      w.reject.execute(new RejectCollectionBatchByBankCommand(w.batchId, REASON, "staff_2")),
    ).rejects.toThrow(RejectedBatchHasReturnsError);
    expect(w.steps.log).not.toContain("save:batch:rejected_by_bank");
    expect(w.orders.saved.get(w.orderId)?.stateName).toBe("collected");
  });

  it("refuse à partir du jour d'échéance (Q3)", async () => {
    const w = await depositedWorld();
    const day = w.batches.saved.get(w.batchId)?.toPersistence().requestedCollectionDay?.value ?? "";
    w.clock.set(new Date(`${day}T08:00:00.000Z`));

    await expect(
      w.reject.execute(new RejectCollectionBatchByBankCommand(w.batchId, REASON, "staff_2")),
    ).rejects.toThrow(BankRejectionAfterCollectionDayError);
  });

  it("refuse un lot déjà rejeté : l'état est terminal", async () => {
    const w = await depositedWorld();
    await w.reject.execute(new RejectCollectionBatchByBankCommand(w.batchId, REASON, "staff_2"));

    await expect(
      w.reject.execute(new RejectCollectionBatchByBankCommand(w.batchId, REASON, "staff_2")),
    ).rejects.toThrow(BatchNotDepositedError);
  });
});
