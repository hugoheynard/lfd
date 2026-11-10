import type { CardRefundRetryRefusal } from "../errors/card-refund-errors.js";
import type {
  CardRefundForm,
  CardRefundNature,
  CardRefundRequestState,
  CardRefundStatus,
} from "../value-objects/card-refund-values.js";

/**
 * **La forme d'une demande de remboursement** et les règles pures qui la
 * lisent — à part de l'agrégat (`card-refund-request.ts`) pour qu'il tienne
 * dans sa taille ; aucune n'écrit.
 */

/** Le préfixe de la clé d'idempotence — une valeur, stable (§3.5, v14). */
export const KEY_PREFIX = "lfd-card-refund";

/** Le motif d'un essai qui n'a pas abouti, tel que l'écran le relit. */
export const UNAVAILABLE_FAILURE = "unavailable";

/** Le motif d'une demande, code du sujet : borné comme en base (`refund_request_reason_bounded`). */
export const REASON_MAX = 64;

/** Le motif d'un « rendu autrement » : borné comme en base (`refund_request_settled_reason_bounded`). */
export const SETTLED_REASON_MAX = 500;

/** Une demande telle que la table `card_payment.refund_request` la range. */
export interface CardRefundRequestSnapshot {
  readonly id: string;
  readonly paymentId: string;
  readonly form: CardRefundForm;
  readonly amountCents: number | null;
  readonly nature: CardRefundNature;
  readonly reason: string;
  readonly state: CardRefundRequestState;
  readonly announcedCents: number;
  readonly issuedCents: number | null;
  readonly requestedAt: Date;
  readonly requestedBy: string | null;
  readonly generation: number;
  readonly round: number;
  readonly attempts: number;
  readonly providerRef: string | null;
  readonly issuedAt: Date | null;
  readonly lastFailure: string | null;
  readonly lastAttemptAt: Date | null;
  readonly claimedUntil: Date | null;
  readonly claimToken: string | null;
  readonly nextAttemptAt: Date | null;
  readonly settledByStaffId: string | null;
  readonly settledReason: string | null;
}

/** Ce que le sujet nomme en demandant de rendre de l'argent. */
export interface CardRefundRequestIntent {
  readonly id: string;
  readonly paymentId: string;
  readonly form: CardRefundForm;
  /** Le montant d'une `amount` ; `null` pour une `remainder`. */
  readonly amountCents: number | null;
  readonly nature: CardRefundNature;
  readonly reason: string;
  readonly announcedCents: number;
  readonly requestedAt: Date;
  readonly requestedBy: string | null;
  /** Quand le balayage peut la prendre ; `null` : elle naît arrêtée et attend le bouton. */
  readonly firstAttemptAt: Date | null;
}

/** La condition de l'écriture : ce qu'on a chargé, ou `null` pour une demande neuve. */
export interface CardRefundRequestExpectation {
  readonly state: CardRefundRequestState;
  readonly generation: number;
  readonly claimToken: string | null;
}

/** Ce qu'une émission a fait de la demande : rien, ou l'état visé — et l'arrêt, s'il y en a un. */
export interface CardRefundIssuanceEffect {
  readonly changed: boolean;
  readonly stopped: string | null;
}

function isPositiveCents(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** Le motif du refus d'une demande neuve, ou `null` si elle est recevable. */
export function validIntent(intent: CardRefundRequestIntent): string | null {
  if (!isPositiveCents(intent.announcedCents)) {
    return `le montant annoncé (${String(intent.announcedCents)}) doit être un entier positif de centimes`;
  }
  if (
    intent.form === "amount" &&
    (intent.amountCents === null || !isPositiveCents(intent.amountCents))
  ) {
    return "une demande par montant porte un montant entier positif";
  }
  if (intent.form === "remainder" && intent.amountCents !== null) {
    return "une demande du reste ne porte pas de montant : le prestataire rend ce qui reste";
  }
  const reason = intent.reason.trim();
  if (reason === "" || reason.length > REASON_MAX) {
    return `le motif tient en 1 à ${String(REASON_MAX)} caractères`;
  }
  return null;
}

/** La ligne d'une demande neuve : `to_issue` à son échéance, ou née `stopped` (le bouton). */
export function bornSnapshot(intent: CardRefundRequestIntent): CardRefundRequestSnapshot {
  return {
    id: intent.id,
    paymentId: intent.paymentId,
    form: intent.form,
    amountCents: intent.amountCents,
    nature: intent.nature,
    reason: intent.reason.trim(),
    state: intent.firstAttemptAt === null ? "stopped" : "to_issue",
    announcedCents: intent.announcedCents,
    issuedCents: null,
    requestedAt: intent.requestedAt,
    requestedBy: intent.requestedBy,
    generation: 1,
    round: 1,
    attempts: 0,
    providerRef: null,
    issuedAt: null,
    lastFailure: null,
    lastAttemptAt: null,
    claimedUntil: null,
    claimToken: null,
    nextAttemptAt: intent.firstAttemptAt,
    settledByStaffId: null,
    settledReason: null,
  };
}

/**
 * **La règle de « Relancer »** (§3.4, v13, v14) : une `stopped`, ou une
 * `to_issue` déjà tentée ; jamais sous bail ; jamais une `remainder` arrêtée
 * quand une autre `remainder` du même paiement est en cours. Rend le motif du
 * refus, ou `null`.
 */
export function retryRefusalOf(
  snapshot: CardRefundRequestSnapshot,
  claimed: boolean,
  anotherRemainderInProgress: boolean,
): CardRefundRetryRefusal | null {
  if (claimed) {
    return "in_progress";
  }
  const { state, attempts, form } = snapshot;
  const byState: Readonly<Record<CardRefundRequestState, CardRefundRetryRefusal | null>> = {
    issued: "awaiting_bank",
    refunded: "refunded",
    settled_elsewhere: "settled_elsewhere",
    to_issue: attempts > 0 ? null : "never_attempted",
    stopped: form === "remainder" && anotherRemainderInProgress ? "another_in_progress" : null,
  };
  return byState[state];
}

/**
 * Ce qu'un `re_…` émis arrête (§3.5) : mort à la création, ou — pour une
 * `amount` — émis pour un autre montant que demandé. `null` : rien.
 */
export function issuanceStopOf(
  snapshot: CardRefundRequestSnapshot,
  issuedCents: number,
  status: CardRefundStatus,
): string | null {
  if (status === "failed" || status === "canceled") {
    return `refund_${status}`;
  }
  const asked = snapshot.amountCents;
  return snapshot.form === "amount" && asked !== null && asked !== issuedCents
    ? "issued_amount_mismatch"
    : null;
}
