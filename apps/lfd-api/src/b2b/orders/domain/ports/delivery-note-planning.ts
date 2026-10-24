/**
 * **Prévoir le bon de livraison des commandes qu'un arrêt du plan a
 * confirmées** (plan `documentation/commandes/plan-e1-bon-de-livraison-prevu.md`).
 *
 * Déclaré par les commandes — l'abonné de l'arrêt l'appelle après
 * l'absorption, dans la même unité de travail — et implémenté par le contexte
 * des bons de livraison (`appBootstrap/delivery-note-planning.module.ts`).
 * Séparé de {@link PlannedDeliveryNoteVoiding} (ISP) : chacun n'a qu'un appelant.
 */
export abstract class DeliveryNotePlanning {
  /**
   * BL-1 prévu pour chaque commande de `orderIds` confirmée par l'arrêt de
   * `closedAt` ; un BL-1 encore prévu est RÉÉCRIT sur les lignes de la
   * commande, jamais dupliqué. Idempotent : un rejeu ne crée rien.
   */
  abstract planConfirmed(orderIds: readonly string[], closedAt: Date): Promise<void>;
}

/**
 * **Annuler le bon prévu d'une commande qu'on annule** (plan E1, § 6,
 * bloquant 2) : une commande `placed` porte un BL prévu quand une réouverture
 * l'a rendue au client. Appelé dans l'unité de travail de l'annulation.
 */
export abstract class PlannedDeliveryNoteVoiding {
  /** Les BL prévus de la commande passent `voided` ; sans BL prévu, ne fait rien. */
  abstract voidPlannedFor(orderId: string, at: Date): Promise<void>;
}
