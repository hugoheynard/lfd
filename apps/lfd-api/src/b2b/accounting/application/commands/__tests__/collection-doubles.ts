import type { LegalEntityView } from "@lfd/contracts";

import { IdGenerator } from "../../../../../platform/id/id-generator.js";
import type { CreditorSnapshot } from "../../../domain/creditor-snapshot.js";
import type { CollectionBatch } from "../../../domain/entities/collection-batch.js";
import type { OrderCollection } from "../../../domain/entities/order-collection.js";
import { CancelledOrdersReader } from "../../../domain/ports/cancelled-orders.reader.js";
import { CollectionBatchRepository } from "../../../domain/ports/collection-batch.repository.js";
import {
  CollectionCandidatesReader,
  type CollectableOrder,
} from "../../../domain/ports/collection-candidates.reader.js";
import { CollectionLock } from "../../../domain/ports/collection-lock.js";
import {
  CollectionMandatesReader,
  type CollectionMandate,
} from "../../../domain/ports/collection-mandates.reader.js";
import { CreditorReader } from "../../../domain/ports/creditor.reader.js";
import { LegalEntityReader } from "../../../domain/ports/legal-entity.reader.js";
import {
  MandateRecheckReader,
  type MandateNow,
} from "../../../domain/ports/mandate-recheck.reader.js";
import { OrderCollectionRepository } from "../../../domain/ports/order-collection.repository.js";
import type { BillingFollow } from "../../../domain/ports/statement-billing.reader.js";
import type { SepaScheme } from "../../../domain/value-objects/sepa-scheme.js";

/**
 * Doublés du lot figé, chacun héritant de son port. Ils écrivent dans un
 * journal de bord commun (`log`) : c'est ce qui prouve que le verrou est pris
 * AVANT toute lecture.
 */
export class Steps {
  readonly log: string[] = [];
}

/** Des ULID prévisibles — `FixedIdGenerator` rend `id_000001`, que le format refuse. */
export class UlidSequence extends IdGenerator {
  private counter = 0;
  next(): string {
    this.counter += 1;
    return `01JBQ7Z5K8M3QT9P2X4B${String(this.counter).padStart(6, "0")}`;
  }
}

export class FixedCreditors extends CreditorReader {
  constructor(private readonly creditor: CreditorSnapshot | null) {
    super();
  }
  snapshot(): Promise<CreditorSnapshot | null> {
    return Promise.resolve(this.creditor);
  }
  soleIssuer(): Promise<CreditorSnapshot | null> {
    return Promise.resolve(this.creditor);
  }
}

export class FakeCandidates extends CollectionCandidatesReader {
  floorAt: Date | null = new Date("2026-08-01T00:00:00.000Z");
  orders: CollectableOrder[] = [];
  follows: BillingFollow[] = [];
  live: SepaScheme[] = [];
  previous: Date | null = null;
  constructor(private readonly steps: Steps) {
    super();
  }
  floor(): Promise<Date | null> {
    this.steps.log.push("read:floor");
    return Promise.resolve(this.floorAt);
  }
  collectableOrders(): Promise<readonly CollectableOrder[]> {
    return Promise.resolve(this.orders);
  }
  billingFollowsOf(): Promise<readonly BillingFollow[]> {
    return Promise.resolve(this.follows);
  }
  companyNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(new Map(ids.map((id) => [id, `Société ${id}`])));
  }
  consumedMandates(): Promise<ReadonlySet<string>> {
    return Promise.resolve(new Set());
  }
  previousClosure(): Promise<Date | null> {
    return Promise.resolve(this.previous);
  }
  liveSchemes(): Promise<readonly SepaScheme[]> {
    return Promise.resolve(this.live);
  }
}

export class FakeMandates extends CollectionMandatesReader {
  mandates: CollectionMandate[] = [];
  activeFor(): Promise<readonly CollectionMandate[]> {
    return Promise.resolve(this.mandates);
  }
}

export class MemoryBatches extends CollectionBatchRepository {
  readonly saved = new Map<string, CollectionBatch>();
  constructor(private readonly steps: Steps) {
    super();
  }
  load(batchId: string): Promise<CollectionBatch | null> {
    return Promise.resolve(this.saved.get(batchId) ?? null);
  }
  save(batch: CollectionBatch): Promise<void> {
    this.steps.log.push(`save:batch:${batch.status}`);
    this.saved.set(batch.id, batch);
    return Promise.resolve();
  }
}

export class MemoryOrderCollections extends OrderCollectionRepository {
  readonly saved = new Map<string, OrderCollection>();
  load(orderId: string): Promise<OrderCollection | null> {
    return Promise.resolve(this.saved.get(orderId) ?? null);
  }
  ofBatch(batchId: string): Promise<readonly OrderCollection[]> {
    return Promise.resolve(
      [...this.saved.values()].filter((order) => order.toPersistence().batchId === batchId),
    );
  }
  saveAll(collections: readonly OrderCollection[]): Promise<void> {
    for (const collection of collections) {
      this.saved.set(collection.orderId, collection);
    }
    return Promise.resolve();
  }
}

export class RecordingLock extends CollectionLock {
  constructor(private readonly steps: Steps) {
    super();
  }
  acquire(legalEntityId: string): Promise<void> {
    this.steps.log.push(`lock:${legalEntityId}`);
    return Promise.resolve();
  }
}

export class FakeRecheck extends MandateRecheckReader {
  now = new Map<string, MandateNow>();
  currentOf(): Promise<ReadonlyMap<string, MandateNow>> {
    return Promise.resolve(this.now);
  }
}

export class FakeCancelled extends CancelledOrdersReader {
  numbers: string[] = [];
  cancelledAmong(): Promise<readonly string[]> {
    return Promise.resolve(this.numbers);
  }
}

export class FixedEntities extends LegalEntityReader {
  list(): Promise<readonly LegalEntityView[]> {
    return Promise.resolve([]);
  }
  byId(): Promise<LegalEntityView | null> {
    return Promise.resolve(null);
  }
}
