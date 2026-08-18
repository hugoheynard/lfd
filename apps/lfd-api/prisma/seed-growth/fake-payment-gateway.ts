import {
  PaymentGateway,
  type CreateIntentParams,
  type CreatedIntent,
  type PaymentWebhookEvent,
} from "../../src/payments/domain/payment-gateway.js";

/**
 * `PaymentGateway` **factice** pour le seed : le vrai handler de commande tourne
 * (prix, journal, persistance), seule l'intention Stripe est simulée. Aucun appel
 * réseau, aucune charge réelle — exactement ce qu'on veut pour un corpus de démo
 * ou de test de charge. Substitue `StripePaymentGateway` via `overrideProvider`.
 */
export class FakePaymentGateway extends PaymentGateway {
  createIntent(_params: CreateIntentParams): Promise<CreatedIntent> {
    // Id **globalement unique** (le champ est UNIQUE en base) : un compteur remis à
    // zéro à chaque run collisionnerait avec les commandes déjà semées.
    const id = `pi_seed_${crypto.randomUUID()}`;
    return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
  }

  publishableKey(): string {
    return "pk_seed";
  }

  parseWebhook(): PaymentWebhookEvent {
    return { kind: "ignored" };
  }
}
