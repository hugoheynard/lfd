import { DeliveryOrdersReader } from "../../channels/commerce/index.js";

/**
 * Les livraisons NON annulées parmi les commandes d'un fait du fournil —
 * clôture ou retirage (`documentation/livraisons/tournees/composition-automatique.md`, §4). Bornée aux
 * identifiants DU FAIT, jamais au statut `confirmed` : l'abonné du commerce
 * peut ne pas être passé. Partagée par les deux abonnés pour qu'ils ne
 * divergent pas sur ce qu'est « une livraison du plan ».
 */
export async function activeDeliveriesAmong(
  orders: DeliveryOrdersReader,
  orderIds: readonly string[],
): Promise<readonly string[]> {
  if (orderIds.length === 0) {
    return [];
  }
  const facts = await orders.byIds(orderIds);
  return facts
    .filter((order) => order.delivery && order.status === "active")
    .map((order) => order.orderId);
}
