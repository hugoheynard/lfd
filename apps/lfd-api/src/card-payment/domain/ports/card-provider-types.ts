/**
 * **Les formes qu'un prestataire de carte rend**, réduites à ce que la
 * plateforme décide dessus — copiées de `b2b/payments/domain/payment-gateway.ts`
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
}

/** Intention créée : la référence (clé de rapprochement) et son secret client. */
export interface CreatedIntent {
  readonly providerRef: string;
  /** Pour l'élément de paiement du navigateur (non secret au sens OAuth). */
  readonly clientSecret: string;
}

/**
 * Où en est une intention chez le prestataire :
 * `awaiting_payment` (payable), `processing` (issue inconnue), `succeeded`
 * (encaissée, le webhook suit), `canceled` (morte).
 */
export type CardIntentState = "awaiting_payment" | "processing" | "succeeded" | "canceled";

/** Intention relue : sa référence, son secret, son état courant. */
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
