import type { RefundReport } from "../../domain/entities/order-refund.js";

/**
 * Constate un remboursement Stripe sur la commande qui porte cette intention
 * de paiement (`stripePaymentIntentId`, unique). Émise par le contrôleur de
 * webhook **après** vérification de la signature — jamais depuis une requête
 * client. Idempotente par `report.stripeRefundId`.
 */
export class RecordOrderRefundCommand {
  constructor(
    readonly paymentIntentId: string,
    readonly report: RefundReport,
  ) {}
}
