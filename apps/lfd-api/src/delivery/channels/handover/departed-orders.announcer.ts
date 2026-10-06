/**
 * **« Ces commandes sont parties »** — la garde passe au livreur
 * (`documentation/livraisons/a-la-porte.md`, § 10 ter, BQ).
 *
 * Déclarée par la livraison, implémentée par le retrait, qui garde « partie en
 * livraison » par commande (sa clé) et l'offre au fournil : un verdict
 * qualité sur une commande partie est refusé.
 *
 * Une ANNONCE, à part de `DepartureHoldsReader` (ISP) : la lecture se fait
 * dans la transaction du départ, l'annonce APRÈS sa validation (`AfterCommit`,
 * B0) — un départ annulé n'annonce rien. Rejouée, elle est sans effet de plus.
 */
export abstract class DepartedOrdersAnnouncer {
  /**
   * @param orderIds les commandes des arrêts vivants au départ.
   * @param at l'instant du départ, posé par la tournée.
   */
  abstract ordersDeparted(orderIds: readonly string[], at: Date): Promise<void>;
}
