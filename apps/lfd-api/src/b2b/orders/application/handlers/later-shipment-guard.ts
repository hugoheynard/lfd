import { FIRST_SHIPMENT_RANK } from "../../../../production/channels/commerce/index.js";
import { LaterShipmentNotYetHandledError } from "../../domain/errors/order-errors.js";

/**
 * **Un fait d'envoi de rang > 1 n'agit pas sur la commande** (plan
 * `documentation/commandes/plan-e7-reliquat-bati.md`, §3 bis).
 *
 * Les abonnés du commerce à `handover.handed_over` et `packing.shortfall_*`
 * agissent sur la COMMANDE : remise, en manque. Un fait de reliquat qui y
 * passerait déclarerait la commande entière remise ou en manque alors que
 * seul son reste l'est.
 *
 * Écrit en L3b comme un **écart** journalisé (le reçu posé, le fait perdu) ;
 * devenu en L4a un **refus rejouable** : le message n'est pas acquitté, il
 * finit mort et se rejoue quand le lot nommé l'aura rendu par envoi.
 * `packing.order_packed` n'y passe plus depuis L4a : son rang > 1 a son
 * abonné (`OnRemainderPacked`, bons de livraison).
 *
 * @param lot le lot du plan qui traitera ce fait par envoi.
 * @throws {LaterShipmentNotYetHandledError} le fait est de rang > 1.
 */
export function ensureFirstShipment(
  fact: { readonly rank: number; readonly orderId: string },
  factType: string,
  lot: string,
): void {
  if (fact.rank !== FIRST_SHIPMENT_RANK) {
    throw new LaterShipmentNotYetHandledError(factType, fact.orderId, fact.rank, lot);
  }
}
