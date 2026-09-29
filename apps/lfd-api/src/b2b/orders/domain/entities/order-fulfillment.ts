import type { OrderClientele } from "@lfd/contracts";

import { InvalidOrderFulfillmentError } from "../errors/order-errors.js";
import type { OrderFulfillmentInput } from "./order-shapes.js";

// Règles pures de l'agrégat `Order`, sorties de `order.ts` comme l'ont été ses
// gardes de montants (`order-amount-guards.ts`). Seul l'agrégat les appelle.

/**
 * **Qui commande** : `pro` quand la commande est passée pour une société,
 * `public` sinon — quel que soit le statut de la société.
 *
 * C'est QUI commande, pas le tarif : une société en attente est `pro` ici et
 * B2C au tarif (plan `documentation/order/plan-nature-du-client-sur-la-commande.md`,
 * D1 et D2). Aucun appelant ne la passe, pour qu'aucun ne puisse la contredire.
 *
 * ⚠️ Règle **appliquée par l'agrégat**, pas une impossibilité : la base ne la
 * contraint pas, et une société supprimée remet `company_id` à nul sous une
 * commande restée `pro` (D3).
 */
export function clienteleOf(companyId: string | null): OrderClientele {
  return companyId === null ? "public" : "pro";
}

/**
 * Coursier ⇒ zone + adresse requises, pas de point ; retrait ⇒ point requis, pas
 * de zone ni d'adresse. Coupe le résidu pour ne rien figer d'incohérent.
 *
 * Le lien vers le carnet suit la même règle : coupé en retrait, et REFUSÉ sur
 * une commande sans société — une adresse du carnet appartient toujours à une
 * société, et un lien sans elle ne pourrait désigner que celle d'un autre.
 */
export function normalizeFulfillment(
  fulfillment: OrderFulfillmentInput,
  companyId: string | null,
): OrderFulfillmentInput {
  if (fulfillment.method === "delivery") {
    if (fulfillment.deliveryZoneId === null || fulfillment.deliveryAddress === null) {
      throw new InvalidOrderFulfillmentError("Un coursier exige une zone et une adresse.");
    }
    if (fulfillment.deliveryAddressId !== null && companyId === null) {
      throw new InvalidOrderFulfillmentError(
        "Une commande sans société ne peut pas être reliée à une adresse du carnet : " +
          "saisir l'adresse de livraison à la volée, ou passer la commande pour la société.",
      );
    }
    return {
      method: "delivery",
      deliveryZoneId: fulfillment.deliveryZoneId,
      deliveryAddress: fulfillment.deliveryAddress,
      deliveryAddressId: fulfillment.deliveryAddressId,
      pickupAddress: null,
    };
  }
  if (fulfillment.pickupAddress === null) {
    throw new InvalidOrderFulfillmentError("Un retrait exige un point de retrait.");
  }
  return {
    method: fulfillment.method,
    deliveryZoneId: null,
    deliveryAddress: null,
    deliveryAddressId: null,
    pickupAddress: fulfillment.pickupAddress,
  };
}
