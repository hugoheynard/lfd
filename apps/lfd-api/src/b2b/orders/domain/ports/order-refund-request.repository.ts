import type { OrderRefundRequest } from "../entities/order-refund-request.js";

/**
 * Port d'**écriture** de la demande de remboursement (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C4.5) : charger,
 * sauver. Aucune écriture ciblée — ce qui a été tenté ne bouge que par les
 * méthodes de {@link OrderRefundRequest}.
 *
 * À appeler dans une unité de travail, APRÈS le verrou de la ligne `orders` :
 * c'est l'ordre des verrous de l'annulation et du carnet (C4.6).
 */
export abstract class OrderRefundRequestRepository {
  abstract load(orderId: string): Promise<OrderRefundRequest | null>;

  /**
   * Insère une demande neuve, ou réécrit une demande chargée **à condition**
   * que sa génération et son jeton de bail n'aient pas bougé depuis.
   *
   * @throws {RefundRequestConflictError} l'écriture conditionnée n'a pas franchi.
   */
  abstract save(request: OrderRefundRequest): Promise<void>;
}
