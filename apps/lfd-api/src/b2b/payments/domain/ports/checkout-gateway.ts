import type { CheckoutSession } from "../entities/payment-link.js";

/** Ce qu'il faut pour ouvrir une page de paiement hébergée. Montant en **centimes**. */
export interface CheckoutSessionRequest {
  readonly amountCents: number;
  /** Code ISO minuscule, ex. `eur`. */
  readonly currency: string;
  /** Repris tel quel sur la page Stripe. */
  readonly label: string;
  readonly companyId: string;
  /** Posé en métadonnée : de quoi retrouver le lien depuis le tableau de bord Stripe. */
  readonly paymentLinkId: string;
}

/**
 * Un événement de l'endpoint des liens, **déjà vérifié** et réduit : la
 * session d'un lien encaissée (`paid`) ou morte sans règlement (`expired`) ;
 * tout le reste est `ignored` (200, rien n'est muté).
 */
export type PaymentLinkWebhookEvent =
  | { readonly kind: "paid"; readonly sessionId: string }
  | { readonly kind: "expired"; readonly sessionId: string }
  | { readonly kind: "ignored" };

/**
 * Port de la **page de paiement hébergée** (Stripe Checkout).
 *
 * ⚠️ Séparé de `PaymentGateway`, où le plan (§2b) plaçait ces deux méthodes :
 * la passation de commande consomme `PaymentGateway` à quatre endroits, et
 * aucun n'ouvre de page hébergée. Un port élargi aurait obligé chacun de ses
 * doublés de test à jouer deux verbes qu'il n'appelle jamais (ISP,
 * `CLAUDE.md` §2). Son adaptateur (`StripeCheckoutGateway`) parle au même
 * compte Stripe.
 *
 * ⚠️ « le webhook reste unique (`PaymentGateway.parseWebhook`) » était écrit
 * ici jusqu'au 2026-11-09 : depuis le lot P0.c2 du plan M2, les liens ont LEUR
 * endpoint et LEUR secret (`parseLinkWebhook`), et `PaymentGateway` n'existe
 * plus — les cartes sont au bloc `card-payment`.
 */
export abstract class CheckoutGateway {
  /**
   * Ouvre une session `mode: payment`.
   * @throws {PaymentGatewayUnavailableError} canal non configuré ou réponse sans URL.
   */
  abstract createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSession>;

  /**
   * Ferme une session encore ouverte : plus personne ne peut payer par elle.
   * @throws {PaymentGatewayUnavailableError} canal non configuré, ou Stripe refuse
   *   (session déjà payée ou expirée).
   */
  abstract expireCheckoutSession(sessionId: string): Promise<void>;

  /**
   * Vérifie la signature d'un webhook de l'endpoint des liens avec SON secret
   * (`STRIPE_LINKS_WEBHOOK_SECRET`), et réduit l'événement.
   * @throws {PaymentLinksWebhookNotConfiguredError} secret absent (400).
   * @throws {InvalidWebhookSignatureError} signature invalide — rien n'est traité.
   */
  abstract parseLinkWebhook(rawBody: Buffer, signature: string): PaymentLinkWebhookEvent;
}
