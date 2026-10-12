import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

/**
 * **Une commande, vue de l'annulation staff** — ce que la règle lit, et ce
 * que le geste emporte (l'intention Stripe, le bon de fidélité, l'auteur).
 */
export interface CancellationSubject {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly placedByUserId: string;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  readonly totalCents: number;
  /** `AAAA-MM-JJ`, ou `null` : commande sans jour de service. */
  readonly serviceDay: string | null;
  /** L'instant d'une annulation staff ; `null` pour une annulation automatique. */
  readonly cancelledAt: Date | null;
  readonly stripePaymentIntentId: string | null;
  readonly loyaltyVoucherId: string | null;
}

/**
 * Port de **lecture**, sans verrou : le premier regard du geste (refus
 * immédiats, avant tout appel à Stripe) et l'affichage du détail staff. La
 * décision se reprend sous verrou par `OrderCancellationRepository.lock`.
 */
export abstract class CancellationSubjectReader {
  abstract find(orderId: string): Promise<CancellationSubject | null>;
}
