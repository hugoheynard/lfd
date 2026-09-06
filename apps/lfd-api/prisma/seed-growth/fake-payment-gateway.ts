import {
  PaymentGateway,
  type CreateIntentParams,
  type CreatedIntent,
  type PaymentWebhookEvent,
} from "../../src/b2b/payments/domain/payment-gateway.js";

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

  /**
   * 🔴 Cette méthode **manquait**, et la classe était donc abstraite sans le
   * dire : `retrieveIntent` a été ajoutée au port sans que le double la suive.
   * Rien ne l'a rougi tant que les seeds tournaient sans vérification de types.
   *
   * Elle rend l'intention telle qu'elle a été créée — c'est ce que Stripe fait,
   * et un double qui rendrait autre chose apprendrait au seed des choses fausses.
   */
  retrieveIntent(paymentIntentId: string): Promise<CreatedIntent> {
    return Promise.resolve({ paymentIntentId, clientSecret: `${paymentIntentId}_secret` });
  }

  publishableKey(): string {
    return "pk_seed";
  }

  parseWebhook(): PaymentWebhookEvent {
    return { kind: "ignored" };
  }
}
