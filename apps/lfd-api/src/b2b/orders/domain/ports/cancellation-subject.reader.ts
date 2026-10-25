import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

import type { RefundPosition } from "../entities/order-refund.js";

/**
 * **Une commande, vue de l'annulation staff** — ce que la règle lit, et ce
 * que le geste emporte (l'intention Stripe, le bon de fidélité, l'auteur).
 */
export interface CancellationSubject {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly placedByUserId: string;
  /**
   * La société de la commande, ou `null` : commande personnelle. Lue pour
   * l'autorisation du plan A1 (`cancellationAllowanceOf`).
   */
  readonly companyId: string | null;
  /**
   * Retrait ou livraison — lu SOUS le verrou de la ligne `orders` par le
   * geste : une livraison inscrite ne se retire jamais (plan A1, § 1 point 3 ;
   * on ne défait ni bac ni tournée).
   */
  readonly fulfillmentMethod: "pickup" | "delivery";
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  /** `AAAA-MM-JJ`, ou `null` : commande sans jour de service. */
  readonly serviceDay: string | null;
  /** L'instant d'une annulation staff ; `null` pour une annulation automatique. */
  readonly cancelledAt: Date | null;
  readonly stripePaymentIntentId: string | null;
  readonly loyaltyVoucherId: string | null;
  /**
   * Ce qui reste à rendre et ce qui est en vol, lu au carnet (`order_refund`)
   * avec la commande — sous le verrou de sa ligne quand c'est `lock()` qui
   * lit (lot C4, C4.4, C4.6).
   */
  readonly refunds: RefundPosition;
}

/**
 * Port de **lecture**, sans verrou : le premier regard du geste (refus
 * immédiats, avant tout appel à Stripe) et l'affichage du détail staff. La
 * décision se reprend sous verrou par `OrderCancellationRepository.lock`.
 */
export abstract class CancellationSubjectReader {
  abstract find(orderId: string): Promise<CancellationSubject | null>;
}
