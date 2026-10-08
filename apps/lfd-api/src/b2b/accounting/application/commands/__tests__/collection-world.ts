import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { CREDITOR } from "../../../domain/services/__tests__/collection-fixtures.js";
import { CancelCollectionBatchHandler } from "../cancel-collection-batch.handler.js";
import { ConstituteCollectionBatchesHandler } from "../constitute-collection-batches.handler.js";
import { DepositCollectionBatchHandler } from "../deposit-collection-batch.handler.js";
import {
  FakeCancelled,
  FakeCandidates,
  FakeMandates,
  FakeRecheck,
  FixedBuyers,
  FixedCreditors,
  FixedEntities,
  MemoryBatches,
  MemoryOrderCollections,
  MemoryStatements,
  RecordingLock,
  Steps,
  UlidSequence,
} from "./collection-doubles.js";

/**
 * Le monde des handlers du lot figé : les trois handlers branchés sur les
 * mêmes doublés. Partagé par les suites du lot et de l'arrêté de facturation.
 */

/** Après la clôture de septembre ; comparé au cycle seulement, jamais au mur. */
export const AFTER_CLOSE = new Date("2026-10-02T09:00:00.000Z");

export function world() {
  const steps = new Steps();
  const batches = new MemoryBatches(steps);
  const w = {
    steps,
    candidates: new FakeCandidates(steps),
    mandates: new FakeMandates(),
    batches,
    statements: new MemoryStatements(steps, batches),
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
    w.statements,
    new FixedBuyers(),
    new RecordingLock(steps),
    new UlidSequence(),
    w.clock,
    w.events,
    new DirectUnitOfWork(),
  );
  const cancel = new CancelCollectionBatchHandler(
    w.batches,
    w.orders,
    w.statements,
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
