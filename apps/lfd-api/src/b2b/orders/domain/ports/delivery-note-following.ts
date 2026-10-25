/**
 * **Le bon de livraison suit la commande** (plans
 * plan E1 (`documentation/commandes/bon-de-livraison.md`) et
 * plan E2 (`documentation/commandes/bon-de-livraison.md`), § 8.3) — prévoir à l'arrêt du plan,
 * préparer au bac fermé, remettre avec la commande, annuler avec elle.
 *
 * Déclaré par les commandes, implémenté par le contexte des bons de livraison
 * (`appBootstrap/delivery-note-planning.module.ts`). UN port pour les quatre
 * gestes, et c'est la décision du plan E2 (§ 8.3) : il remplace
 * `DeliveryNotePlanning` et `PlannedDeliveryNoteVoiding` d'E1. Chaque appelant
 * tourne dans SA propre unité de travail, après l'écriture conditionnelle de
 * la commande, et seulement quand elle a franchi : le BL s'écrit dans la même
 * transaction, ou pas du tout.
 *
 * Aucun geste ne lève pour un écart qu'il ne sait pas réparer (BL annulé seul,
 * statut mort…) : la commande avance quand même, l'écart est journalisé et le
 * réconciliateur le compte (plan E2, § 8.2).
 */
export abstract class DeliveryNoteFollowing {
  /**
   * BL-1 prévu pour chaque commande de `orderIds` confirmée par l'arrêt de
   * `closedAt` ; un BL-1 encore prévu est RÉÉCRIT sur les lignes de la
   * commande, jamais dupliqué. Idempotent : un rejeu ne crée rien.
   */
  abstract planConfirmed(orderIds: readonly string[], closedAt: Date): Promise<void>;

  /**
   * La commande vient d'être déclarée prête : son BL passe `prepared`, à
   * l'instant de la commande — créé plein s'il n'existait pas (prête hors plan).
   */
  abstract prepare(orderId: string): Promise<void>;

  /**
   * La commande vient d'être remise : son BL passe `handed_over`, avec
   * l'instant et le jour de réception de la commande — créé plein s'il
   * n'existait pas (remise hors plan, Q-E5).
   */
  abstract handOver(orderId: string): Promise<void>;

  /**
   * Le départ incomplet de la commande vient d'être décidé (E6b, plan E6
   * § 13) : son BL prévu se réécrit aux quantités décidées, ses montants
   * recomposés — par la même règle que les autres gestes.
   */
  abstract followDecision(orderId: string): Promise<void>;

  /** La commande vient d'être annulée : tout BL non remis passe `voided` à `at`. */
  abstract voidLiveFor(orderId: string, at: Date): Promise<void>;
}
