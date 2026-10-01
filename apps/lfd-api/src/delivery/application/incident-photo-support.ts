import type { ProductionDocumentStore } from "../../platform/storage/production-document-store.js";
import type { StoredDocument } from "../../platform/storage/document-store.js";
import { IncidentPhotoNotFoundError } from "../domain/errors/delivery-doorstep-errors.js";
import type { IncidentPhotoRef } from "../domain/ports/incident-photos.reader.js";
import { incidentPhotoContentType } from "../domain/value-objects/incident-photo.js";

/**
 * Relit la photo d'un signalement au stockage, son type relu dans ses octets
 * — aucune colonne ne le porte. Une ligne qui promet une photo et un objet
 * absent est une panne, et lève comme telle (`read`).
 *
 * @throws {IncidentPhotoNotFoundError} sans référence de photo.
 */
export async function readIncidentPhoto(
  store: ProductionDocumentStore,
  ref: IncidentPhotoRef | null,
): Promise<StoredDocument> {
  if (ref === null) {
    throw new IncidentPhotoNotFoundError();
  }
  const bytes = await store.read(ref.photoKey);
  const contentType = incidentPhotoContentType(bytes);
  if (contentType === null) {
    throw new IncidentPhotoNotFoundError();
  }
  return { bytes, contentType };
}
