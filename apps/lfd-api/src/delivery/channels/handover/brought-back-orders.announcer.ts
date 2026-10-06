/**
 * **« Ces commandes sont revenues »** — la garde rentre au dépôt
 * (`documentation/livraisons/a-la-porte.md`, B3, LB-Q2, et la note du
 * § 10 ter : « une commande rapportée qui repartira un autre jour reste
 * “partie” entre-temps : B3 devra le dire au retrait »).
 *
 * Déclarée par la livraison, implémentée par le retrait, qui marque la
 * commande revenue : le fournil peut de nouveau la contrôler. Une ANNONCE à
 * part de `DepartedOrdersAnnouncer` (ISP) : ni le départ ni la décision n'a
 * besoin de l'autre. Faite APRÈS la validation (`AfterCommit`) — une décision
 * annulée n'annonce rien. Rejouée, elle est sans effet de plus.
 */
export abstract class BroughtBackOrdersAnnouncer {
  /**
   * @param orderIds les commandes des arrêts « rapportés ».
   * @param at l'instant de la décision ; un départ POSTÉRIEUR (la commande
   *   déjà repartie) n'est pas effacé.
   */
  abstract ordersBroughtBack(orderIds: readonly string[], at: Date): Promise<void>;
}
