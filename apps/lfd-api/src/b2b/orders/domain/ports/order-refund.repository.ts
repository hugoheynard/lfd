import type { OrderRefundLedger } from "../entities/order-refund-ledger.js";

/**
 * Port d'**écriture** des remboursements d'une commande : charger le carnet,
 * le sauver. Aucune écriture ciblée — le statut d'un remboursement et le
 * règlement de la commande ne bougent que par {@link OrderRefundLedger.record}.
 */
export abstract class OrderRefundRepository {
  /**
   * Le carnet de la commande qui porte cette intention Stripe, **sous verrou
   * de sa ligne** : deux webhooks de remboursement concurrents sur la même
   * commande ne peuvent pas lire tous deux un cumul qui ne compte pas l'autre.
   * À appeler dans une unité de travail — hors transaction, le verrou ne
   * tiendrait que le temps de sa propre requête.
   *
   * `null` : aucune commande ne porte cette intention (un lien libre, ou un
   * paiement qui n'est pas à nous).
   */
  abstract loadByPaymentIntent(paymentIntentId: string): Promise<OrderRefundLedger | null>;

  /** Écrit les remboursements du carnet et, s'il a bougé, le règlement de la commande. */
  abstract save(ledger: OrderRefundLedger): Promise<void>;
}
