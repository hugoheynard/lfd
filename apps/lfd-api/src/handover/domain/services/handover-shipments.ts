import { FIRST_SHIPMENT_RANK } from "../../../production/channels/handover/index.js";

/**
 * **L'envoi d'une commande au comptoir** — règles pures, sans port.
 *
 * Une commande part en un seul envoi, son rang 1 : le reste d'un manque
 * devient une commande à part (le reliquat), qui a son propre QR. Le rang
 * reste dans les clés et les faits ; un rang > 1 n'a plus rien à tendre.
 */

/** Le rang 1 se tend sans regarder le colisage ; un autre rang n'existe plus. */
export function shipmentPrepared(rank: number): boolean {
  return rank === FIRST_SHIPMENT_RANK;
}

/**
 * La référence gravée d'un envoi : le numéro de commande au rang 1, à
 * l'identique, suffixé `-<rang>` au-delà — `order_handover.reference` est
 * unique sur toute la table.
 */
export function shipmentReference(orderNumber: string, rank: number): string {
  return rank === FIRST_SHIPMENT_RANK ? orderNumber : `${orderNumber}-${String(rank)}`;
}
