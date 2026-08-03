import { BusinessError, ResourceNotFoundError } from "../../shared/errors/app-error.js";

/** Le point de retrait visé n'existe pas (**404**). */
export class PickupAddressNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("pickup.not_found", "Point de retrait introuvable.");
  }
}

/**
 * Suppression refusée : c'est le **dernier** point de retrait. Refus **métier**
 * (409) — au moins un point doit subsister pour que le retrait reste possible.
 */
export class LastPickupAddressError extends BusinessError {
  constructor() {
    super(
      "pickup.last",
      "Impossible de supprimer le dernier point de retrait : il en faut au moins un.",
    );
  }
}
