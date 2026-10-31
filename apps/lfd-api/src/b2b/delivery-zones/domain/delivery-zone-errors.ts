import { BusinessError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/** La zone de livraison visée n'existe pas (**404**). */
export class DeliveryZoneNotFoundError extends ResourceNotFoundError {
  constructor(readonly id: string) {
    super("delivery_zone.not_found", "Zone de livraison introuvable.");
  }
}

/** Un préfixe est déjà couvert par une autre zone (**409**) — un préfixe, une zone. */
export class DuplicatePostalCodeError extends BusinessError {
  constructor(readonly prefix: string) {
    super(
      "delivery_zone.duplicate_postal_code",
      `Le code postal « ${prefix} » est déjà couvert par une zone de livraison.`,
    );
  }
}

/**
 * Une zone qu'une promotion nomme, archivée comprise (**409**) — plan
 * `documentation/promotions/plan-acheminements-a-cocher.md`, § 9 : une
 * promotion garde la trace de ses zones.
 */
export class DeliveryZoneTargetedByPromotionError extends BusinessError {
  constructor(
    readonly promotionName: string,
    readonly archived: boolean,
  ) {
    super(
      "delivery_zone.targeted_by_promotion",
      `Cette zone est nommée par la promotion « ${promotionName} »${archived ? " (archivée)" : ""} : une promotion garde la trace de ses zones.`,
    );
  }
}
