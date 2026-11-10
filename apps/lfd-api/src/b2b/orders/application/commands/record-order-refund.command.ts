import type { RefundReport } from "../../domain/entities/order-refund.js";

/**
 * Constate un remboursement Stripe sur la commande qui porte cette intention
 * de paiement (`stripePaymentIntentId`, unique). Émise par l'abonné du fait
 * `card_payment.provider_refund_event` (`OnCardProviderRefundEvent`, plan M2
 * lot P0.c2), que le webhook des cartes publie **après** vérification de la
 * signature — jamais depuis une requête client. Idempotente par `report.stripeRefundId`.
 */
export class RecordOrderRefundCommand {
  constructor(
    readonly paymentIntentId: string,
    readonly report: RefundReport,
  ) {}
}
