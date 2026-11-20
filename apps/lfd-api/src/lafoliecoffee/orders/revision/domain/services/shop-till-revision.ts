import type { FulfillmentMethod } from "@lfd/contracts";

import type { SettlementVenue } from "../../../domain/value-objects/settlement-venue.js";
import { ShopTillOrderRevisedToDeliveryError } from "../errors/shop-till-revision.error.js";

/**
 * Une commande à régler à la caisse de la boutique reste un retrait à chaque
 * révision — l'image, côté modification, de la garde de la passation
 * (`ensureShopTillPickup`). Jugée sur la composition révisée, par l'équipe
 * comme par le client.
 *
 * @throws {ShopTillOrderRevisedToDeliveryError} la révision demande une livraison.
 */
export function ensureShopTillStaysPickup(
  order: { readonly settlementVenue: SettlementVenue | null },
  revisedMethod: FulfillmentMethod,
): void {
  if (order.settlementVenue === "shop_till" && revisedMethod !== "pickup") {
    throw new ShopTillOrderRevisedToDeliveryError();
  }
}
