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
 * Où en est une intention **chez le prestataire**, réduit à ce que la
 * plateforme décide dessus.
 *
 * - `awaiting_payment` — personne n'a encore payé : saisie de carte à faire,
 *   confirmation ou authentification 3-D Secure en cours. Payable.
 * - `processing` — le paiement est parti, l'issue n'est pas connue.
 * - `succeeded` — encaissée. Plus rien à payer ; le webhook suit.
 * - `canceled` — morte : toute opération dessus échoue chez le prestataire.
 */
export type PaymentIntentState = "awaiting_payment" | "processing" | "succeeded" | "canceled";

/** Intention relue : ce que {@link CreatedIntent} porte, plus son état courant. */
export interface RetrievedIntent extends CreatedIntent {
  readonly state: PaymentIntentState;
}

/**
 * Issue d'une demande d'annulation d'intention — **jamais une exception** pour
 * un cas métier, parce que chacun appelle un geste différent de l'appelant
 * (plan `documentation/order/plan-abandon-du-reglement.md`, §5) :
 *
 * - `cancelled` — annulée par cet appel ;
 * - `already_cancelled` — elle l'était déjà. C'est le **second clic** : l'état
 *   voulu est atteint, l'appelant le traite comme un succès ;
 * - `already_paid` — encaissée : on ne touche à rien, le webhook réconcilie ;
 * - `in_progress` — paiement en cours : on ne se prononce pas ;
 * - `unavailable` — le prestataire n'a pas pu répondre (réseau, panne, canal
 *   non configuré, ou refus que la plateforme ne sait pas lire). `reason` est
 *   destinée au journal, jamais à un client.
 */
export type IntentCancellation =
  | { readonly kind: "cancelled" }
  | { readonly kind: "already_cancelled" }
  | { readonly kind: "already_paid" }
  | { readonly kind: "in_progress" }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Événement de webhook **déjà vérifié** et réduit à ce dont le domaine a besoin.
 * On ne propage pas l'objet Stripe brut : seulement l'issue et l'id d'intention à
 * rapprocher. `ignored` = un type d'événement qui ne nous concerne pas (on répond
 * 200 pour que Stripe cesse de réessayer, sans rien muter).
 */
export type PaymentWebhookEvent =
  | { readonly kind: "succeeded"; readonly paymentIntentId: string }
  | { readonly kind: "failed"; readonly paymentIntentId: string }
  /**
   * Un **lien libre** est encaissé (plan liens de paiement §2b) :
   * `checkout.session.completed` avec `payment_status = paid`, ou
   * `checkout.session.async_payment_succeeded`. Un `completed` encore impayé
   * (moyen de paiement différé) est `ignored` : son issue viendra plus tard.
   */
  | { readonly kind: "link_paid"; readonly sessionId: string }
  /** La session d'un lien libre a expiré sans règlement (`checkout.session.expired`). */
  | { readonly kind: "link_expired"; readonly sessionId: string }
  | { readonly kind: "ignored" };

/**
 * Port du **prestataire de paiement**.
 *
 * Le domaine ne connaît pas Stripe : il crée une intention pour un montant, lit sa
 * clé publique (pour le Payment Element), et fait vérifier la signature des
 * webhooks, relit ou annule une intention. L'adaptateur `StripePaymentGateway` les implémente ;
 * un test peut le substituer par un faux sans réseau.
 */
export abstract class PaymentGateway {
  /**
   * Crée une intention de paiement pour `amountCents`.
   * @throws {PaymentGatewayUnavailableError} canal non configuré ou réponse Stripe inexploitable.
   */
  abstract createIntent(params: CreateIntentParams): Promise<CreatedIntent>;

  /**
   * Relit une intention **déjà créée** pour en obtenir le `clientSecret` et
   * son état : un secret d'intention annulée ou encaissée ne se sert pas.
   *
   * Le secret n'est pas persisté chez nous, et c'est délibéré : seul l'id de
   * l'intention l'est. Un client qui revient régler une commande laissée en
   * attente le redemande donc au prestataire, plutôt que de le lire dans une
   * colonne où il aurait vieilli.
   *
   * @throws {PaymentGatewayUnavailableError} canal non configuré, intention
   * inconnue, ou réponse sans `client_secret`.
   */
  abstract retrieveIntent(paymentIntentId: string): Promise<RetrievedIntent>;

  /**
   * Demande au prestataire d'annuler une intention. Ne lève pas : chaque issue,
   * panne comprise, est rendue typée — un appelant qui ne doit jamais être
   * bloqué par le prestataire (la clôture du fournil) n'a rien à attraper.
   */
  abstract cancelIntent(paymentIntentId: string): Promise<IntentCancellation>;

  /** Clé **publique** Stripe (`pk_…`) à transmettre au navigateur. */
  abstract publishableKey(): string;

  /**
   * Vérifie la signature du webhook et réduit l'événement à sa forme domaine.
   * @throws {InvalidWebhookSignatureError} signature invalide — l'événement n'est pas traité.
   * @throws {PaymentGatewayUnavailableError} canal non configuré.
   */
  abstract parseWebhook(rawBody: Buffer, signature: string): PaymentWebhookEvent;
}
