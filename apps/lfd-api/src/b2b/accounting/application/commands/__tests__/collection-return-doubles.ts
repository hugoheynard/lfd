import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { OrderCollection } from "../../../domain/entities/order-collection.js";
import type {
  CollectionReturn,
  ReturnableLine,
} from "../../../domain/entities/collection-return.js";
import {
  RECORDED_AT,
  returnableLine,
} from "../../../domain/entities/__tests__/collection-return-fixtures.js";
import { CollectionReturnRepository } from "../../../domain/ports/collection-return.repository.js";
import { ReturnableLinesReader } from "../../../domain/ports/returnable-lines.reader.js";
import { ConfirmCollectionReturnImportHandler } from "../confirm-collection-return-import.handler.js";
import { RecordCollectionReturnHandler } from "../record-collection-return.handler.js";
import { RepresentCollectionReturnHandler } from "../represent-collection-return.handler.js";
import { SettleCollectionReturnHandler } from "../settle-collection-return.handler.js";
import { WriteOffCollectionReturnHandler } from "../write-off-collection-return.handler.js";
import { FakeRecheck, MemoryOrderCollections, UlidSequence } from "./collection-doubles.js";

/** Les retours en mémoire ; `save` crée ou réécrit, comme l'`upsert`. */
export class MemoryCollectionReturns extends CollectionReturnRepository {
  readonly saved = new Map<string, CollectionReturn>();
  load(returnId: string): Promise<CollectionReturn | null> {
    return Promise.resolve(this.saved.get(returnId) ?? null);
  }
  ofEndToEnd(endToEndId: string): Promise<CollectionReturn | null> {
    return Promise.resolve(
      [...this.saved.values()].find((item) => item.endToEndId === endToEndId) ?? null,
    );
  }
  save(bankReturn: CollectionReturn): Promise<void> {
    this.saved.set(bankReturn.id, bankReturn);
    return Promise.resolve();
  }
}

/** Les lignes connues ; « déjà retournée » se lit dans les retours en mémoire. */
export class FakeReturnableLines extends ReturnableLinesReader {
  lines: ReturnableLine[] = [];
  constructor(private readonly returns: MemoryCollectionReturns) {
    super();
  }
  lineOf(batchId: string, rank: number): Promise<ReturnableLine | null> {
    return Promise.resolve(
      this.lines.find((line) => line.batchId === batchId && line.rank === rank) ?? null,
    );
  }
  byEndToEndIds(ids: readonly string[]): Promise<ReadonlyMap<string, ReturnableLine>> {
    return Promise.resolve(
      new Map(
        this.lines.filter((line) => ids.includes(line.endToEndId)).map((l) => [l.endToEndId, l]),
      ),
    );
  }
  alreadyReturned(ids: readonly string[]): Promise<ReadonlySet<string>> {
    const returned = [...this.returns.saved.values()].map((item) => item.endToEndId);
    return Promise.resolve(new Set(ids.filter((id) => returned.includes(id))));
  }
}

/** Deux commandes prélevées sur la ligne 1 du lot 1. */
export function collectedOrders(line: ReturnableLine): OrderCollection[] {
  return ["o_1", "o_2"].map((orderId) => {
    const order = OrderCollection.due(orderId, 6_000, RECORDED_AT);
    order.batch(line.batchId, line.rank, RECORDED_AT);
    order.collect(RECORDED_AT);
    return order;
  });
}

/** Le monde des retours : une ligne déposée, ses commandes prélevées, un mandat actif. */
export function returnWorld(line: ReturnableLine = returnableLine()) {
  const returns = new MemoryCollectionReturns();
  const lines = new FakeReturnableLines(returns);
  lines.lines = [line];
  const orders = new MemoryOrderCollections();
  for (const order of collectedOrders(line)) {
    orders.saved.set(order.orderId, order);
  }
  const mandates = new FakeRecheck();
  mandates.now.set(line.mandateId, { active: true, iban: null });
  const events = new RecordingPublisher();
  const clock = new FixedClock(RECORDED_AT);
  const uow = new DirectUnitOfWork();
  const ids = new UlidSequence();
  return {
    returns,
    lines,
    orders,
    mandates,
    events,
    record: new RecordCollectionReturnHandler(returns, lines, orders, ids, clock, events, uow),
    represent: new RepresentCollectionReturnHandler(
      returns,
      lines,
      orders,
      mandates,
      clock,
      events,
      uow,
    ),
    settle: new SettleCollectionReturnHandler(returns, lines, orders, clock, events, uow),
    writeOff: new WriteOffCollectionReturnHandler(returns, lines, orders, clock, events, uow),
    confirm: new ConfirmCollectionReturnImportHandler(
      returns,
      lines,
      orders,
      ids,
      clock,
      events,
      uow,
    ),
  };
}

/** L'état de chaque commande de la ligne. */
export function statesOf(orders: MemoryOrderCollections): readonly string[] {
  return [...orders.saved.values()].map((order) => order.stateName);
}
