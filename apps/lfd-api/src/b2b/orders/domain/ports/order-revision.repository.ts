import type {
  OrderRevisionToSave,
  RevisableOrder,
  RevisionActor,
} from "../entities/order-revision.js";

/**
 * Port d'**écriture** de la révision d'une commande (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1, §9).
 *
 * Le cycle de l'agrégat : `lock` recharge la commande sous `FOR UPDATE` —
 * le verrou que prennent l'annulation, l'émission mensuelle et la
 * constitution d'un lot —, `Order.revise` juge la nouvelle composition, et
 * `save` l'écrit. Les deux REJOIGNENT l'unité de travail ambiante.
 */
export abstract class OrderRevisionRepository {
  /** Verrouille la ligne `orders`, puis la relit. `null` : commande inconnue. */
  abstract lock(orderId: string): Promise<RevisableOrder | null>;

  /**
   * Écrit la révision, conditionnée en base sur la révision corrigée ET sur
   * `placed` (R7) : la composition précédente part EN ENTIER dans
   * l'historique, les lignes sont remplacées, `orders` est toujours mis à
   * jour (`revision`, donc les déclencheurs de journée voient l'ancien et le
   * nouveau jour).
   *
   * Rend `false` si rien n'a franchi : la révision n'était plus la courante,
   * ou la commande n'était plus `placed`.
   */
  abstract save(revision: OrderRevisionToSave, author: RevisionActor, at: Date): Promise<boolean>;
}
