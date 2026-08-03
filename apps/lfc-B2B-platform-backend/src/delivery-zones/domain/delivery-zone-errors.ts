import { BusinessError, ResourceNotFoundError } from "../../shared/errors/app-error.js";

/** La zone de livraison visée n'existe pas (**404**). */
export class DeliveryZoneNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("delivery_zone.not_found", "Zone de livraison introuvable.");
  }
}

/** Le code postal a déjà une zone (**409**) — un code postal, une zone. */
export class DuplicatePostalCodeError extends BusinessError {
  constructor(readonly codePostal: string) {
    super("delivery_zone.duplicate_postal_code", "Ce code postal a déjà une zone de livraison.");
  }
}
