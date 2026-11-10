import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { CancelCollectionBatchCommand } from "../cancel-collection-batch.command.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { DepositCollectionBatchCommand } from "../deposit-collection-batch.command.js";
import { DepositCollectionBatchHandler } from "../deposit-collection-batch.handler.js";
import { RecordCollectionBatchDownloadCommand } from "../record-collection-batch-download.command.js";
import { CollectionBatchChangedConcurrentlyError } from "../../../domain/errors/collection-errors.js";
import type { MandateNow } from "../../../domain/ports/mandate-recheck.reader.js";
import {
  ENTITY_ID,
  STAFF_AUTHOR,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { FakeRecheck, FixedEntities, MemoryBatches, StepBatchLock } from "./collection-doubles.js";
import { world } from "./collection-world.js";
import { MemoryBatchNoticeStates, sendAllQueued } from "./notice-doubles.js";

/**
 * Régression (revue du 2026-10-23) : le dépôt et l'annulation ne prenaient
 * pas le verrou du lot, et le lot s'écrivait sur son `id` seul. Deux gestes
 * simultanés lisaient tous deux un lot `constituted` ; le dernier écrit
 * gagnait, et les commandes restaient dans l'état de l'autre — un lot annulé
 * aux commandes `collected`, ou l'inverse.
 */

/** Un monde avec un lot constitué, téléchargé, avis partis : prêt au dépôt. */
async function readyToDeposit() {
  const w = world();
  w.candidates.orders = [order("c_port")];
  w.mandates.mandates = [mandate("c_port")];
  const [id = ""] = await w.constitute.execute(
    new ConstituteCollectionBatchesCommand(ENTITY_ID, STAFF_AUTHOR),
  );
  w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
  sendAllQueued(w.noticeStore, w.clock.now());
  await w.download.execute(new RecordCollectionBatchDownloadCommand(id, "staff_1"));
  return { w, id };
}

/** La relecture des mandats, pendant laquelle un autre geste annule le lot. */
class CancelledMeanwhile extends FakeRecheck {
  constructor(
    private readonly batches: MemoryBatches,
    private readonly batchId: string,
    now: Map<string, MandateNow>,
  ) {
    super();
    this.now = now;
  }
  override currentOf(): Promise<ReadonlyMap<string, MandateNow>> {
    this.batches.storedStatus.set(this.batchId, "cancelled");
    return super.currentOf();
  }
}

describe("le lot sous le verrou : dépôt, annulation, téléchargement", () => {
  it("le dépôt prend le verrou du lot AVANT de le lire", async () => {
    const { w, id } = await readyToDeposit();
    const from = w.steps.log.length;

    await w.deposit.execute(new DepositCollectionBatchCommand(id, "staff_1"));

    const steps = w.steps.log.slice(from);
    expect(steps[0]).toBe(`lock:batch:${id}`);
    expect(steps).toContain("save:batch:deposited");
  });

  it("l'annulation prend le verrou du lot AVANT de le lire", async () => {
    const { w, id } = await readyToDeposit();
    const from = w.steps.log.length;

    await w.cancel.execute(new CancelCollectionBatchCommand(id, "staff_1"));

    expect(w.steps.log[from]).toBe(`lock:batch:${id}`);
  });

  it("le téléchargement d'un lot ANNULÉ passe toujours, sous le verrou", async () => {
    const { w, id } = await readyToDeposit();
    await w.cancel.execute(new CancelCollectionBatchCommand(id, "staff_1"));
    const from = w.steps.log.length;

    await w.download.execute(new RecordCollectionBatchDownloadCommand(id, "staff_1"));

    expect(w.steps.log.slice(from)).toEqual([`lock:batch:${id}`, "save:batch:cancelled"]);
  });

  it("un lot qui a changé d'état entre la lecture et l'écriture refuse en 409, avant d'écrire les commandes", async () => {
    const { w, id } = await readyToDeposit();
    const deposit = new DepositCollectionBatchHandler(
      new StepBatchLock(w.steps),
      w.batches,
      w.orders,
      new CancelledMeanwhile(w.batches, id, w.recheck.now),
      w.cancelled,
      new MemoryBatchNoticeStates(w.noticeStore),
      new FixedEntities(),
      w.clock,
      w.events,
      new DirectUnitOfWork(),
    );

    const refused = deposit.execute(new DepositCollectionBatchCommand(id, "staff_1"));

    await expect(refused).rejects.toBeInstanceOf(CollectionBatchChangedConcurrentlyError);
    await expect(refused).rejects.toThrow("a changé d'état pendant le geste");
    // Les commandes ne sont pas écrites : la transaction s'arrête au lot. (En
    // mémoire, l'agrégat de commande est partagé — c'est l'e2e qui prouve
    // qu'aucune ligne `orders` n'a bougé.)
    expect(w.events.factTypes()).not.toContain("collection.batch_deposited");
  });
});
