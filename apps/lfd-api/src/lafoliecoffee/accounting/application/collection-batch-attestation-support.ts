import type { CollectionBatchAttestations } from "../domain/entities/collection-batch-attestation.js";
import { CollectionBatchNotFoundError } from "../domain/errors/collection-errors.js";
import type { CollectionBatchAttestationRepository } from "../domain/ports/collection-batch-attestation.repository.js";
import type { LegalEntityReader } from "../domain/ports/legal-entity.reader.js";
import type { ExportEntity } from "../domain/events/mandate-bank-export.events.js";
import { exportEntityOrFail, journalEntity } from "./mandate-bank-export-support.js";

/**
 * Le lot et ses attestations, avec l'entité qui le porte — le sujet du fait
 * au journal. Partagé par « attester » et « retirer ».
 *
 * @throws {CollectionBatchNotFoundError} le lot n'existe pas.
 */
export async function attestationsOrFail(
  readers: {
    readonly attestations: CollectionBatchAttestationRepository;
    readonly entities: LegalEntityReader;
  },
  batchId: string,
): Promise<{ readonly attestations: CollectionBatchAttestations; readonly entity: ExportEntity }> {
  const attestations = await readers.attestations.load(batchId);
  if (attestations === null) {
    throw new CollectionBatchNotFoundError(batchId);
  }
  const entity = await exportEntityOrFail(readers.entities, attestations.batch.legalEntityId);
  return { attestations, entity: journalEntity(entity) };
}
