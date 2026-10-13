import type { RefundStatus } from "../entities/order-refund.js";
import type { OrderRefundRequestState } from "../entities/order-refund-request.js";

/** Une demande avec ce que le carnet en sait — sans verrou, pour l'affichage. */
export interface RefundRequestSnapshot {
  readonly request: OrderRefundRequestState;
  readonly orderNumber: string;
  readonly chargedCents: number;
  readonly refunds: readonly {
    readonly stripeRefundId: string;
    readonly amountCents: number;
    readonly status: RefundStatus;
  }[];
}

/**
 * Port de **lecture** des demandes de remboursement (doc
 * `documentation/commandes/annulation/annulation-par-le-staff.md`, C4.7, C4.9). Sans
 * verrou : ce qu'il rend oriente, il ne décide pas — l'exécuteur relit sous
 * verrou.
 */
export abstract class OrderRefundRequestReader {
  /**
   * Les demandes que le balayage peut prendre : sans `re_…`, dont l'échéance
   * est passée à `wallNow`, par ordre d'échéance, au plus `limit`.
   */
  abstract dueForSweep(wallNow: Date, limit: number): Promise<readonly string[]>;

  /** L'intention de paiement de la commande, ou `null`. */
  abstract paymentIntentOf(orderId: string): Promise<string | null>;

  /** La demande et le carnet de la commande, ou `null` sans demande. */
  abstract snapshotOf(orderId: string): Promise<RefundRequestSnapshot | null>;
}
