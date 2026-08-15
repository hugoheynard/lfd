/** Paramètres de création d'une intention de paiement. Montant en **centimes**. */
export interface CreateIntentParams {
  readonly amountCents: number;
  /** Code ISO minuscule, ex. `eur`. */
  readonly currency: string;
  /** Rattachement (traçabilité côté Stripe), ou `null` pour une commande
   * personnelle (sans entreprise). Le mur reste serveur. */
  readonly companyId: string | null;
}

/** Intention créée : l'id Stripe (clé de rapprochement) et son client secret. */
export interface CreatedIntent {
  /** `pi_…` — persisté sur la commande, clé de rapprochement du webhook. */
  readonly paymentIntentId: string;
  /** À passer au Payment Element côté client (non secret au sens OAuth). */
  readonly clientSecret: string;
}

/**
 * Événement de webhook **déjà vérifié** et réduit à ce dont le domaine a besoin.
 * On ne propage pas l'objet Stripe brut : seulement l'issue et l'id d'intention à
 * rapprocher. `ignored` = un type d'événement qui ne nous concerne pas (on répond
 * 200 pour que Stripe cesse de réessayer, sans rien muter).
 */
export type PaymentWebhookEvent =
  | { readonly kind: "succeeded"; readonly paymentIntentId: string }
  | { readonly kind: "failed"; readonly paymentIntentId: string }
  | { readonly kind: "ignored" };

/**
 * Port du **prestataire de paiement**.
 *
 * Le domaine ne connaît pas Stripe : il crée une intention pour un montant, lit sa
 * clé publique (pour le Payment Element), et fait vérifier la signature des
 * webhooks. L'adaptateur `StripePaymentGateway` implémente ces trois opérations ;
 * un test peut le substituer par un faux sans réseau.
 */
export abstract class PaymentGateway {
  /**
   * Crée une intention de paiement pour `amountCents`.
   * @throws {PaymentGatewayUnavailableError} canal non configuré ou réponse Stripe inexploitable.
   */
  abstract createIntent(params: CreateIntentParams): Promise<CreatedIntent>;

  /**
   * Relit une intention **déjà créée** pour en obtenir le `clientSecret`.
   *
   * Le secret n'est pas persisté chez nous, et c'est délibéré : seul l'id de
   * l'intention l'est. Un client qui revient régler une commande laissée en
   * attente le redemande donc au prestataire, plutôt que de le lire dans une
   * colonne où il aurait vieilli.
   *
   * @throws {PaymentGatewayUnavailableError} canal non configuré, intention
   * inconnue, ou réponse sans `client_secret`.
   */
  abstract retrieveIntent(paymentIntentId: string): Promise<CreatedIntent>;

  /** Clé **publique** Stripe (`pk_…`) à transmettre au navigateur. */
  abstract publishableKey(): string;

  /**
   * Vérifie la signature du webhook et réduit l'événement à sa forme domaine.
   * @throws {InvalidWebhookSignatureError} signature invalide — l'événement n'est pas traité.
   * @throws {PaymentGatewayUnavailableError} canal non configuré.
   */
  abstract parseWebhook(rawBody: Buffer, signature: string): PaymentWebhookEvent;
}
