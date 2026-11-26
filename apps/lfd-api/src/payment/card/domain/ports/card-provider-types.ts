/**
 * **Les formes qu'un prestataire de carte rend**, réduites à ce que la
 * plateforme décide dessus — copiées de `lafoliecoffee/payments/domain/payment-gateway.ts`
 * et `payment-refunder.ts` (plan M2, §4.2 : P0 COPIE, le lot c2 retire les
 * originaux), et rendues agnostiques : une intention s'y nomme `providerRef`,
 * pas `paymentIntentId`.
 */

/** Une intention à créer. Montant en centimes ; `tag` opaque, posé chez le prestataire. */
export interface CreateIntentParams {
  readonly amountCents: number;
  /** Code ISO minuscule, ex. `eur`. */
  readonly currency: string;
  /**
   * La métadonnée d'aujourd'hui (`companyId` ou `personal`) : de la
   * traçabilité chez le prestataire, jamais un mur — le mur reste serveur.
   */
  readonly tag: string;
  /** Ce que le tableau de bord du prestataire montre de l'intention. */
  readonly description: string;
  /** Les clés de l'appelant, déjà bornées par `IntentLabel` ; `companyId` s'y ajoute. */
  readonly metadata: Readonly<Record<string, string>>;
  /** Le client du compte qui paie ; absent : aucun (un payeur anonyme). */
  readonly customerRef?: string;
}

/**
 * **Un client à créer chez le prestataire**, pour un compte. La clé
 * d'idempotence est déterministe (compte + personne) : deux paiements
 * rapprochés ne font qu'un client.
 */
export interface CreateCustomerParams {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly idempotencyKey: string;
}

/**
 * **Comment le navigateur fait payer le client** — une instruction neutre du
 * prestataire, que l'adaptateur remplit et que la page lit sans connaître le
 * prestataire (doc
 * `documentation/payment/les-liens-de-paiement.md`) :
 * - `embedded` — un formulaire du prestataire intégré à notre page, monté avec
 *   sa clé **publique** et un jeton propre à ce paiement (pour Stripe, le
 *   `client_secret` de la PaymentIntent) ;
 * - `redirect` — la page du prestataire, où l'on envoie le client.
 *
 * Le résultat n'arrive jamais par la page : toujours par le webhook du compte
 * qui encaisse.
 */
export type CardCollection =
  | {
      readonly kind: "embedded";
      /** Le prestataire, pour que la page choisisse son formulaire (`stripe`). */
      readonly provider: string;
      readonly publishableKey: string;
      readonly token: string;
    }
  | {
      readonly kind: "redirect";
      readonly provider: string;
      readonly url: string;
    };

/** Intention créée : la référence (clé de rapprochement) et l'instruction de collecte. */
export interface CreatedIntent {
  readonly providerRef: string;
  readonly collection: CardCollection;
}

/**
 * Où en est une intention chez le prestataire :
 * `awaiting_payment` (payable), `processing` (issue inconnue), `succeeded`
 * (encaissée, le webhook suit), `canceled` (morte).
 */
export type CardIntentState = "awaiting_payment" | "processing" | "succeeded" | "canceled";

/** Intention relue : sa référence, son instruction de collecte, son état courant. */
export interface RetrievedIntent extends CreatedIntent {
  readonly state: CardIntentState;
}

/**
 * L'issue d'une annulation — **jamais une exception** : chacune appelle un
 * geste différent de l'appelant (`cancelled` ; `already_cancelled`, le second
 * clic ; `already_paid`, le webhook réconcilie ; `in_progress` ; `unavailable`,
 * dont la raison va au journal, jamais à un client).
 */
export type IntentCancellation =
  | { readonly kind: "cancelled" }
  | { readonly kind: "already_cancelled" }
  | { readonly kind: "already_paid" }
  | { readonly kind: "in_progress" }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * **Le libellé définitif d'une intention** (plan
 * `documentation/payment/plan-pointage-stripe.md`, lot 2) — la description et
 * les clés de l'appelant, déjà bornées par `IntentLabel`. Rien d'autre ne
 * change : ni montant, ni client.
 */
export interface IntentDescription {
  readonly description: string;
  readonly metadata: Readonly<Record<string, string>>;
}

/**
 * L'issue d'un libellé posé — jamais une exception : `described`, `refused`
 * (le prestataire refuse la demande elle-même : intention inconnue, requête
 * invalide — la reprendre ne changerait rien), `unavailable` (réseau, 5xx,
 * 429 : à reprendre).
 */
export type IntentDescribing =
  | { readonly kind: "described" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * Les statuts d'un remboursement chez le prestataire. Un statut inconnu de
 * cette liste rend l'événement `other` plutôt que de le faire passer pour un
 * autre.
 */
export const CARD_REFUND_STATUSES = [
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;
export type CardRefundStatus = (typeof CARD_REFUND_STATUSES)[number];

/** Un remboursement tel que le prestataire le rend. `createdAt` est SON instant. */
export interface IssuedRefund {
  readonly refundId: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: CardRefundStatus;
  readonly createdAt: Date;
}

/**
 * Ce qu'on demande au prestataire pour une demande de remboursement (plan M2,
 * §3.5) : la clé, la demande et sa génération (posées en métadonnée), le sujet
 * (posé en métadonnée `lfd_order_id`, opaque : `order:ord_1`), et le montant —
 * `null` pour une `remainder` : le prestataire rend ce qui reste, jamais plus.
 */
export interface RefundParams {
  /** `lfd-card-refund:<requestId>:<generation>:<round>` — la clé d'idempotence (§3.5, v14). */
  readonly key: string;
  readonly requestId: string;
  readonly generation: number;
  /** Le sujet, tel qu'on le lit chez le prestataire ; jamais un identifiant de demande. */
  readonly subjectLabel: string;
  /**
   * Les clés de pointage du sujet (`order_number`, `app`…), déjà bornées par
   * `IntentLabel` : aucune ne recouvre une clé `lfd_*` (plan-pointage-stripe.md, lot 3).
   */
  readonly labelMetadata: Readonly<Record<string, string>>;
  /** `null` : le reste du paiement ; sinon le montant exact d'une `amount`, en centimes. */
  readonly amountCents: number | null;
}

/** Ce que la recherche filtre : un remboursement de CETTE demande, de CETTE génération. */
export interface RefundLookupParams {
  readonly requestId: string;
  readonly generation: number;
}

/**
 * L'issue d'une demande de remboursement — jamais une exception :
 * `issued` (trouvé ou créé), `nothing_left` (tout est déjà rendu), `declined`
 * (refus définitif), `unavailable` (réseau, 5xx, 429, clé en cours, compte
 * non configuré).
 */
export type RefundIssuance =
  | { readonly kind: "issued"; readonly refund: IssuedRefund }
  | { readonly kind: "nothing_left" }
  | { readonly kind: "declined"; readonly code: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/** L'issue d'une recherche seule : trouvé, rien, ou pas de réponse. */
export type RefundLookup =
  | { readonly kind: "found"; readonly refund: IssuedRefund }
  | { readonly kind: "none" }
  | { readonly kind: "unavailable"; readonly reason: string };
