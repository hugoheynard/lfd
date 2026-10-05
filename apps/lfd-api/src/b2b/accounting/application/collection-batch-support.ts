import { CollectionBatch } from "../domain/entities/collection-batch.js";
import { CollectionBatchNotFoundError } from "../domain/errors/collection-errors.js";
import type { BatchEntity } from "../domain/events/collection.events.js";
import type { CollectionBatchRepository } from "../domain/ports/collection-batch.repository.js";
import type { LegalEntityReader } from "../domain/ports/legal-entity.reader.js";

/** @throws {CollectionBatchNotFoundError} */
export async function loadBatchOrFail(
  batches: CollectionBatchRepository,
  batchId: string,
): Promise<CollectionBatch> {
  const batch = await batches.load(batchId);
  if (batch === null) {
    throw new CollectionBatchNotFoundError(batchId);
  }
  return batch;
}

/**
 * L'entité d'un lot, avec son nom du moment — pour le journal. Une entité
 * archivée garde sa fiche ; son id ne sert de nom que si la fiche a disparu,
 * ce que la clé étrangère `RESTRICT` interdit.
 */
export async function batchEntity(
  entities: LegalEntityReader,
  batch: CollectionBatch,
): Promise<BatchEntity> {
  const id = batch.toPersistence().legalEntityId;
  const view = await entities.byId(id);
  return { id, name: view?.name ?? id };
}
