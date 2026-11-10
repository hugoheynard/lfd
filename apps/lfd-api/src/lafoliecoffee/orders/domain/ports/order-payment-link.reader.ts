import type { OrderStatus, PaymentStatus } from "@lfd/contracts";

/**
 * Une commande vue sous l'angle de son **règlement par carte** : de quoi la
 * lister, la nommer, et écrire à celui qui l'a passée.
 */
export interface OrderPaymentStanding {
  readonly orderId: string;
  readonly reference: string;
  /** `null` = commande personnelle, sans société. */
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly totalCents: number;
  readonly placedAt: Date;
  readonly status: OrderStatus;
  readonly paymentStatus: PaymentStatus;
  /** Le client à qui la commande appartient — le destinataire du lien. */
  readonly placedByUserId: string;
}

/**
 * Port de **lecture** des commandes à régler (plan liens de paiement §2a).
 *
 * Étroit exprès : `OrderReader` porte neuf verbes, et la page de la
 * comptabilité n'en voudrait qu'un — ses doublés de test auraient dû jouer les
 * huit autres. Cross-tenant par nature, gardé en amont par
 * `@AdminSurface("b2b_accounting")`.
 */
export abstract class OrderPaymentLinkReader {
  /**
   * Les commandes dont le règlement par carte est `pending` ou `failed`, non
   * annulées, la plus récente en tête.
   */
  abstract listAwaitingPayment(): Promise<readonly OrderPaymentStanding[]>;

  /** Une commande par id, quel que soit son état — `null` si elle n'existe pas. */
  abstract findStanding(orderId: string): Promise<OrderPaymentStanding | null>;
}
