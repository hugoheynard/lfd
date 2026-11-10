import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { asOrderBuyerKind, type OrderBuyerKind } from "../domain/value-objects/order-buyer-kind.js";

/**
 * Lit `orders.buyer_kind` dans le vocabulaire du domaine. Refuse plutôt que
 * de replier sur `registered` : la colonne est tenue par un CHECK, une valeur
 * inconnue dit que la base a été élargie sans que le lecteur suive.
 *
 * @throws {UnknownOrderBuyerKindError} valeur hors du CHECK.
 */
export function buyerKindOf(orderId: string, value: string): OrderBuyerKind {
  const kind = asOrderBuyerKind(value);
  if (kind === null) {
    throw new UnknownOrderBuyerKindError(orderId, value);
  }
  return kind;
}

/** Une porte de passation inconnue en base — 500. */
export class UnknownOrderBuyerKindError extends TechnicalError {
  constructor(orderId: string, value: string) {
    super(
      "orders.buyer_kind.unknown",
      `La commande ${orderId} porte une porte de passation inconnue (« ${value} ») : seules « guest » et « registered » existent. ` +
        "La base a été modifiée hors du code — ne pas modifier cette commande, et prévenir l'équipe technique.",
    );
  }
}
