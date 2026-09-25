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
 * Port de la **page de paiement hébergée** (Stripe Checkout).
 *
 * ⚠️ Séparé de `PaymentGateway`, où le plan (§2b) plaçait ces deux méthodes :
 * la passation de commande consomme `PaymentGateway` à quatre endroits, et
 * aucun n'ouvre de page hébergée. Un port élargi aurait obligé chacun de ses
 * doublés de test à jouer deux verbes qu'il n'appelle jamais (ISP,
 * `CLAUDE.md` §2). Son adaptateur (`StripeCheckoutGateway`) parle au même
 * compte Stripe, et le webhook reste unique (`PaymentGateway.parseWebhook`).
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
}
