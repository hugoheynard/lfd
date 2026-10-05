import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  CollectionFloorMissingError,
  DepositRecheckFailedError,
  NothingToCollectError,
} from "../../../domain/errors/collection-errors.js";
import {
  CREDITOR,
  ENTITY_ID,
  mandate,
  order,
} from "../../../domain/services/__tests__/collection-fixtures.js";
import { CancelCollectionBatchCommand } from "../cancel-collection-batch.command.js";
import { CancelCollectionBatchHandler } from "../cancel-collection-batch.handler.js";
import { ConstituteCollectionBatchesCommand } from "../constitute-collection-batches.command.js";
import { ConstituteCollectionBatchesHandler } from "../constitute-collection-batches.handler.js";
import { DepositCollectionBatchCommand } from "../deposit-collection-batch.command.js";
import { DepositCollectionBatchHandler } from "../deposit-collection-batch.handler.js";
import {
  FakeCancelled,
  FakeCandidates,
  FakeMandates,
  FakeRecheck,
  FixedCreditors,
  FixedEntities,
  MemoryBatches,
  MemoryOrderCollections,
  RecordingLock,
  Steps,
  UlidSequence,
} from "./collection-doubles.js";

/** Après la clôture de septembre ; comparé au cycle seulement, jamais au mur. */
const AFTER_CLOSE = new Date("2026-10-02T09:00:00.000Z");

function world() {
  const steps = new Steps();
  const w = {
    steps,
    candidates: new FakeCandidates(steps),
    mandates: new FakeMandates(),
    batches: new MemoryBatches(steps),
    orders: new MemoryOrderCollections(),
    recheck: new FakeRecheck(),
    cancelled: new FakeCancelled(),
    events: new RecordingPublisher(),
    clock: new FixedClock(AFTER_CLOSE),
  };
  const constitute = new ConstituteCollectionBatchesHandler(
    new FixedCreditors(CREDITOR),
    w.candidates,
    w.mandates,
    w.batches,
    w.orders,
    new RecordingLock(steps),
    new UlidSequence(),
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  const cancel = new CancelCollectionBatchHandler(
    w.batches,
    w.orders,
    new FixedEntities(),
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  const deposit = new DepositCollectionBatchHandler(
    w.batches,
    w.orders,
    w.recheck,
    w.cancelled,
    new FixedEntities(),
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  return { ...w, constitute, cancel, deposit };
}

describe("constituer, annuler, déposer un lot", () => {
  it("verrouille l'entité AVANT de lire, puis écrit le lot et ses commandes", async () => {
    const w = world();
    w.candidates.orders = [order("c_port"), order("c_sans_mandat")];
    w.mandates.mandates = [mandate("c_port")];

    const ids = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );

    expect(w.steps.log.slice(0, 2)).toEqual([`lock:${ENTITY_ID}`, "read:floor"]);
    expect(ids).toHaveLength(1);
    const states = [...w.orders.saved.values()].map((o) => o.toPersistence());
    expect(states.map((s) => s.state).sort()).toEqual(["batched", "excluded"]);
    expect(w.events.factTypes()).toEqual(["collection.batch_constituted"]);
    // Q2 : la société sans mandat rend le lot indéposable.
    expect(w.batches.saved.get(ids[0] ?? "")?.depositable).toBe(false);
  });

  it("annuler rend les commandes `due` ; reconstituer prend un AUTRE lot", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [first] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );

    await w.cancel.execute(new CancelCollectionBatchCommand(first ?? "", "staff_1"));

    expect([...w.orders.saved.values()].map((o) => o.stateName)).toEqual(["due"]);
    w.candidates.orders = w.candidates.orders.map((o) => ({
      ...o,
      collection: w.orders.saved.get(o.orderId)?.toPersistence() ?? null,
    }));
    const [second] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    expect(second).not.toBe(first);
  });

  it("le dépôt relit le mandat : révoqué depuis la constitution, il refuse et nomme", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    w.recheck.now = new Map([["m_c_port", { active: false, iban: null }]]);

    await expect(
      w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1")),
    ).rejects.toThrow(DepositRecheckFailedError);
  });

  it("le dépôt passe les commandes `collected` quand rien n'a bougé", async () => {
    const w = world();
    const placed = order("c_port");
    w.candidates.orders = [placed];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);

    await w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1"));

    expect(w.orders.saved.get(placed.orderId)?.stateName).toBe("collected");
    expect(w.events.factTypes()).toEqual([
      "collection.batch_constituted",
      "collection.batch_deposited",
    ]);
  });

  it("le dépôt refuse une commande annulée après la constitution", async () => {
    const w = world();
    w.candidates.orders = [order("c_port")];
    w.mandates.mandates = [mandate("c_port")];
    const [id] = await w.constitute.execute(
      new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1"),
    );
    w.recheck.now = new Map([["m_c_port", { active: true, iban: mandate("c_port").iban }]]);
    w.cancelled.numbers = ["CMD-X"];

    await expect(
      w.deposit.execute(new DepositCollectionBatchCommand(id ?? "", "staff_1")),
    ).rejects.toThrow(/CMD-X a été annulée/u);
  });

  it("refuse sans plancher, et quand il n'y a rien à faire", async () => {
    const w = world();
    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1")),
    ).rejects.toThrow(NothingToCollectError);
    w.candidates.floorAt = null;
    await expect(
      w.constitute.execute(new ConstituteCollectionBatchesCommand(ENTITY_ID, "staff_1")),
    ).rejects.toThrow(CollectionFloorMissingError);
  });
});
