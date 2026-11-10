import type { DocumentStore } from "../../../../platform/storage/document-store.js";
import {
  DeliveryStepPhotoNotFoundError,
  DeliveryStepPhotoUnreadableError,
} from "../../domain/errors/delivery-procedure-errors.js";
import type { DeliveryStepPhotoLocator } from "../../domain/ports/delivery-step-photo.locator.js";
import { deliveryStepPhotoContentType } from "../../domain/value-objects/delivery-step-photo.js";

/** La photo prête à servir : de quoi poser le `Content-Type` et écrire le corps. */
export interface DeliveryStepPhotoDownload {
  readonly contentType: string;
  readonly bytes: Buffer;
}

/**
 * Relit la photo d'une étape, **sans mur** — client et staff l'ont posé avant.
 *
 * Le type est relu dans les octets plutôt que gardé en colonne : une colonne
 * pourrait mentir, huit octets non.
 *
 * @throws {DeliveryStepPhotoNotFoundError} l'étape n'a pas de photo, ou n'est
 *   pas à cette adresse.
 * @throws {DeliveryStepPhotoUnreadableError} les octets rangés ne sont pas une
 *   image acceptée — incohérence entre le bucket et la base.
 */
export async function readDeliveryStepPhoto(
  locator: DeliveryStepPhotoLocator,
  store: DocumentStore,
  companyId: string,
  addressId: string,
  stepId: string,
): Promise<DeliveryStepPhotoDownload> {
  const photoKey = await locator.photoKeyOf(companyId, addressId, stepId);
  if (photoKey === null) {
    throw new DeliveryStepPhotoNotFoundError(stepId);
  }
  const bytes = await store.read(photoKey);
  const contentType = deliveryStepPhotoContentType(bytes);
  if (contentType === null) {
    throw new DeliveryStepPhotoUnreadableError(stepId);
  }
  return { contentType, bytes };
}
