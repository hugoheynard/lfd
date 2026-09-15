import {
  type PhotoChange,
  readPhotoChange,
} from "../../../shared/photo-cards/domain/value-objects/photo-change.js";
import { DeliveryStepPhotoIntentError } from "../errors/delivery-procedure-errors.js";
import { DeliveryStepPhoto } from "./delivery-step-photo.js";

/**
 * Lit l'intention d'une révision d'étape : garder, retirer, ou remplacer par
 * une photo validée selon les règles de l'étape.
 *
 * @throws {DeliveryStepPhotoIntentError} retrait demandé ET photo jointe.
 * @throws {InvalidDeliveryStepPhotoError} la photo jointe n'est pas acceptée.
 */
export function deliveryStepPhotoChange(
  removePhoto: boolean,
  bytes: Buffer | null,
): PhotoChange<DeliveryStepPhoto> {
  return readPhotoChange(removePhoto, bytes, {
    accept: (photo) => DeliveryStepPhoto.create(photo),
    ambiguous: () => new DeliveryStepPhotoIntentError(),
  });
}
