import { DomainError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Le canal de paiement (Stripe) n'est pas configuré, ou son SDK a échoué —
 * **incident technique** (500), rien à corriger côté client. Levée par
 * l'adaptateur quand `AppConfig.stripeConfig()` est `null`, ou quand Stripe
 * renvoie une réponse inexploitable (client secret absent). Le message reste
 * neutre côté HTTP (le filtre masque le détail des 500).
 */
export class PaymentGatewayUnavailableError extends TechnicalError {
  constructor(cause?: unknown) {
    super("payments.gateway.unavailable", "Le paiement est momentanément indisponible.", cause);
  }
}

/**
 * La signature d'un webhook reçu est invalide (corps altéré, mauvais secret, ou
 * requête forgée). **400** : la requête est mal formée / non authentifiée par
 * Stripe. On ne traite JAMAIS l'événement dans ce cas — c'est la seule garantie
 * que l'appel vient bien de Stripe et pas d'un tiers.
 */
export class InvalidWebhookSignatureError extends DomainError {
  constructor(cause?: unknown) {
    super("payments.webhook.invalid_signature", "Signature de webhook invalide.", cause);
  }
}
