import type { CollectionFormName } from "../../../domain/value-objects/collection-form.js";
import type { LegalEntityView } from "@lfd/contracts";

import { IdGenerator } from "../../../../../platform/id/id-generator.js";
import type { CreditorSnapshot } from "../../../domain/creditor-snapshot.js";
import type {
  BillingStatement,
  StatementBuyer,
} from "../../../domain/entities/billing-statement.js";
import type {
  CollectionBatch,
  CollectionBatchStatus,
} from "../../../domain/entities/collection-batch.js";
import { BatchNotConstitutedError } from "../../../domain/errors/collection-errors.js";
import type { OrderCollection } from "../../../domain/entities/order-collection.js";
import {
  BillingStatementRepository,
  type CancelledStatement,
} from "../../../domain/ports/billing-statement.repository.js";
import { StatementBuyerReader } from "../../../domain/ports/statement-buyer.reader.js";
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
import type { CollectableInvoice } from "../../../domain/services/collection-assembly.js";
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
  forms = new Map<string, CollectionFormName>();
  collectionFormsAt(): Promise<ReadonlyMap<string, CollectionFormName>> {
    return Promise.resolve(this.forms);
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
  /** `null` par défaut : les suites d'avant E4 gardent l'ancien chemin (l'arrêté). */
  invoicingFloorAt: Date | null = null;
  invoicingFloor(): Promise<Date | null> {
    return Promise.resolve(this.invoicingFloorAt);
  }
  invoices: CollectableInvoice[] = [];
  invoicesOf(orderIds: readonly string[]): Promise<ReadonlyMap<string, CollectableInvoice>> {
    const asked = new Set(orderIds);
    const byOrder = new Map<string, CollectableInvoice>();
    for (const invoice of this.invoices) {
      if (invoice.orderIds.some((id) => asked.has(id))) {
        invoice.orderIds.forEach((id) => byOrder.set(id, invoice));
      }
    }
    return Promise.resolve(byOrder);
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
  /** Le statut tel qu'ENREGISTRÉ — l'agrégat en mémoire peut l'avoir devancé. */
  readonly storedStatus = new Map<string, CollectionBatchStatus>();
  save(batch: CollectionBatch): Promise<void> {
    this.steps.log.push(`save:batch:${batch.status}`);
    this.saved.set(batch.id, batch);
    this.storedStatus.set(batch.id, batch.status);
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
  ofLine(batchId: string, rank: number): Promise<readonly OrderCollection[]> {
    return Promise.resolve(
      [...this.saved.values()].filter((order) => {
        const state = order.toPersistence();
        return state.batchId === batchId && state.lineRank === rank;
      }),
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

/**
 * Les arrêtés, en mémoire. L'annulation rejoue la garde de la base : elle
 * lit le lot tel qu'ENREGISTRÉ (`batches`), et refuse s'il n'est plus
 * `constituted` — comme le déclencheur `billing_statement_immutable`.
 */
export class MemoryStatements extends BillingStatementRepository {
  readonly inserted: BillingStatement[] = [];
  readonly cancelledIds = new Set<string>();
  constructor(
    private readonly steps: Steps,
    private readonly batches: MemoryBatches,
  ) {
    super();
  }
  insert(statement: BillingStatement): Promise<void> {
    this.steps.log.push(`insert:statement:${statement.toPersistence().batchId}`);
    this.inserted.push(statement);
    return Promise.resolve();
  }
  cancelForBatch(batchId: string): Promise<readonly CancelledStatement[]> {
    const stored = this.batches.storedStatus.get(batchId);
    const active = this.inserted
      .map((statement) => statement.toPersistence())
      .filter((state) => state.batchId === batchId && !this.cancelledIds.has(state.id));
    if (active.length > 0 && stored !== undefined && stored !== "constituted") {
      return Promise.reject(new BatchNotConstitutedError(batchId, stored));
    }
    this.steps.log.push(`cancel:statements:${batchId}`);
    for (const state of active) {
      this.cancelledIds.add(state.id);
    }
    return Promise.resolve(
      active.map((state) => ({ statementId: state.id, lineRank: state.lineRank })),
    );
  }
}

/** Chaque payeur demandé a une fiche ; son nom est « Société <id> », comme `companyNames`. */
export class FixedBuyers extends StatementBuyerReader {
  buyersOf(companyIds: readonly string[]): Promise<ReadonlyMap<string, StatementBuyer>> {
    return Promise.resolve(
      new Map(
        companyIds.map((companyId): [string, StatementBuyer] => [
          companyId,
          {
            companyId,
            name: `Société ${companyId}`,
            legalForm: "SARL",
            siret: "55210055400013",
            siren: "552100554",
            vatNumber: "FR89552100554",
            billingAddressLines: ["1 rue du Port", "73000 Chambéry", "France"],
          },
        ]),
      ),
    );
  }
}
