import { DeliveryStepPhotoIntentError } from "../errors/delivery-procedure-errors.js";
import { DeliveryStepPhoto } from "./delivery-step-photo.js";

/**
 * Ce qu'une révision d'étape fait de sa photo : la garder, la retirer, ou la
 * remplacer par une photo **déjà validée**.
 *
 * Une union plutôt qu'un booléen et un fichier facultatif côte à côte : les
 * deux ensemble (« retire-la » ET « voici la nouvelle ») n'ont pas de
 * représentation ici, ils sont refusés à la construction.
 */
export type DeliveryStepPhotoChange =
  | { readonly kind: "keep" }
  | { readonly kind: "remove" }
  | { readonly kind: "replace"; readonly photo: DeliveryStepPhoto };

/**
 * Lit l'intention d'une révision.
 *
 * @throws {DeliveryStepPhotoIntentError} retrait demandé ET photo jointe.
 * @throws {InvalidDeliveryStepPhotoError} la photo jointe n'est pas acceptée.
 */
export function deliveryStepPhotoChange(
  removePhoto: boolean,
  bytes: Buffer | null,
): DeliveryStepPhotoChange {
  if (removePhoto && bytes !== null) {
    throw new DeliveryStepPhotoIntentError();
  }
  if (removePhoto) {
    return { kind: "remove" };
  }
  return bytes === null
    ? { kind: "keep" }
    : { kind: "replace", photo: DeliveryStepPhoto.create(bytes) };
}
