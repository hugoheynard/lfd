import type { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { CollectionBatch } from "../domain/entities/collection-batch.js";
import type { OrderCollection } from "../domain/entities/order-collection.js";
import type { BatchEntity } from "../domain/events/collection.events.js";
import type {
  BillingStatementRepository,
  CancelledStatement,
} from "../domain/ports/billing-statement.repository.js";
import type { LegalEntityReader } from "../domain/ports/legal-entity.reader.js";
import type { OrderCollectionRepository } from "../domain/ports/order-collection.repository.js";
import { batchEntity, statementCancelledEvents } from "./collection-batch-support.js";

/**
 * Ce qu'un lot défait rend à la prochaine constitution — séquence commune à
 * l'annulation avant dépôt et au rejet par la banque (revue qualité du
 * 2026-10-23). Coupée en DEUX, parce que l'écriture du lot se place entre
 * elles différemment : l'annulation libère AVANT d'écrire le lot (la base
 * n'annule l'arrêté que d'un lot encore `constituted`), le rejet APRÈS (elle
 * ne l'annule que d'un lot `rejected_by_bank`).
 */

export interface BatchReleasePorts {
  readonly statements: BillingStatementRepository;
  readonly orders: OrderCollectionRepository;
  readonly entities: LegalEntityReader;
  readonly events: DomainEventPublisher;
}

/**
 * La transition de chaque commande du lot : `release` (`batched → due`,
 * lot annulé) ou `releaseRejected` (`collected → due`, fichier rejeté).
 */
export type ReleaseTransition = "release" | "releaseRejected";

export interface BatchRelease {
  readonly cancelled: readonly CancelledStatement[];
  readonly released: readonly OrderCollection[];
}

/** Annule les arrêtés du lot et libère ses commandes — rien n'est encore écrit pour elles. */
export async function releaseBatch(
  ports: BatchReleasePorts,
  batch: CollectionBatch,
  transition: ReleaseTransition,
  at: Date,
): Promise<BatchRelease> {
  const cancelled = await ports.statements.cancelForBatch(batch.id);
  const released = await ports.orders.ofBatch(batch.id);
  for (const order of released) {
    order[transition](at);
  }
  return { cancelled, released };
}

/**
 * Écrit les commandes libérées, puis publie le fait du lot et l'annulation de
 * chacun de ses arrêtés, dans cet ordre.
 */
export async function saveReleaseAndPublish(
  ports: BatchReleasePorts,
  batch: CollectionBatch,
  release: BatchRelease,
  batchEvent: (entity: BatchEntity) => JournaledEvent,
  at: Date,
): Promise<void> {
  await ports.orders.saveAll(release.released);
  const entity = await batchEntity(ports.entities, batch);
  await ports.events.publishTraced(batchEvent(entity));
  for (const event of statementCancelledEvents(batch, release.cancelled, entity, at)) {
    await ports.events.publishTraced(event);
  }
}
