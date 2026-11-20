import type { FulfillmentMethod } from "@lfd/contracts";

import { ShopTillOrderNotPickupError } from "../errors/shop-till-order-errors.js";

/**
 * Une commande à régler à la caisse de la boutique se retire — jamais livrée
 * (`commande-particulier-reglee-en-boutique.md`, § 5). Opposé tôt par la
 * saisie (avant toute composition) et de nouveau par l'agrégat
 * (`Order.settleAtShopTill`).
 *
 * @throws {ShopTillOrderNotPickupError} une livraison.
 */
export function ensureShopTillPickup(method: FulfillmentMethod): void {
  if (method !== "pickup") {
    throw new ShopTillOrderNotPickupError();
  }
}
