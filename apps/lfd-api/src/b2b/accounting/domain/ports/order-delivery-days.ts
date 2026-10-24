/**
 * **Le jour de livraison d'un bon, posé une fois** (plan
 * `documentation/comptabilite/facturation/plan-zero-faille.md`, lot ZL) :
 * `orders.received_on`, le jour (Europe/Paris) de la première remise
 * attestée. Il date la facture du bon (CGI art. 269-1-a et 269-2-a).
 *
 * Port d'ÉCRITURE seul : les lecteurs de l'assiette lisent la colonne par
 * `billableOrderWhere`, pas par ici.
 */
export abstract class OrderDeliveryDays {
  /**
   * Pose `day` sur le bon s'il n'en porte pas encore.
   *
   * ⚠️ Écriture conditionnée plutôt que `load` → `save` d'un agrégat, comme
   * `OrderRepository.markFulfilled` : c'est la projection d'un fait durable,
   * livré au moins une fois, et la seule règle — « jamais déplacée » — se
   * juge en base (`received_on IS NULL` dans le `where`, et le déclencheur
   * `orders_received_on_frozen`). Une relecture puis une écriture y
   * perdrait l'atomicité pour zéro invariant de plus.
   *
   * @param day `AAAA-MM-JJ`, jour de Paris.
   * @returns `true` si cet appel l'a posée ; `false` si le bon la portait
   *          déjà (rejeu, réannonce) ou n'existe pas.
   */
  abstract recordFirst(orderId: string, day: string): Promise<boolean>;
}
