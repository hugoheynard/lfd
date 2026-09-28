import {
  PaymentGateway,
  type CreateIntentParams,
  type CreatedIntent,
  type IntentCancellation,
  type PaymentWebhookEvent,
  type RetrievedIntent,
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
   * Elle rend l'intention telle qu'elle a été créée, **en attente de
   * paiement** : c'est l'état d'une intention que personne n'a réglée, et le seul
   * que ce double peut affirmer sans inventer un encaissement.
   *
   * ⚠️ Le port a gagné `state` et `cancelIntent` (règlement abandonné) sans que
   * ce double suive — deuxième fois, constaté le 2026-09-28 : `seed:orders` ne
   * compilait plus.
   */
  retrieveIntent(paymentIntentId: string): Promise<RetrievedIntent> {
    return Promise.resolve({
      paymentIntentId,
      clientSecret: `${paymentIntentId}_secret`,
      state: "awaiting_payment",
    });
  }

  /** Aucune intention réelle n'existe : l'annuler réussit toujours. */
  cancelIntent(_paymentIntentId: string): Promise<IntentCancellation> {
    return Promise.resolve({ kind: "cancelled" });
  }

  publishableKey(): string {
    return "pk_seed";
  }

  parseWebhook(): PaymentWebhookEvent {
    return { kind: "ignored" };
  }
}
