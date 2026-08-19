/** Issue d'un paiement rapportée par le webhook Stripe. */
export type PaymentOutcome = "succeeded" | "failed";

/**
 * Rapproche le résultat d'un paiement Stripe avec la commande qui le porte
 * (`stripePaymentIntentId`). Émise par le contrôleur de webhook **après**
 * vérification de la signature — jamais depuis une requête client. Idempotente :
 * rejouer le même événement ne change rien (le webhook Stripe peut réémettre).
 */
export class ConfirmOrderPaymentCommand {
  constructor(
    readonly paymentIntentId: string,
    readonly outcome: PaymentOutcome,
  ) {}
}
