import type { SubjectRefundPosition } from "../requests/card-settlement.reader.js";

/**
 * **Ce qu'un remboursement a fait, rendu au sujet** (plan M2, §3.3, v11) —
 * l'argument de `SubjectSettlement.onRefundOutcome`, une union discriminée
 * par `kind`, un type par genre. Chaque genre porte EXACTEMENT ce que les
 * faits du sujet exigent : recopié champ à champ du §3.3, lui-même relu sur
 * `packages/contracts/src/journal-facts/order-refunds.ts`.
 *
 * Tous portent `position` — l'état **recalculé après l'écriture** des lignes
 * de `card-payment`, d'où le sujet tire `refundedCents` — et `requestId`, la
 * demande concernée ou `null`. 🔴 Dans cette union, `providerRef` désigne le
 * `re_…` (le remboursement chez le prestataire), alors que partout ailleurs
 * dans le bloc il désigne le `pi_…`.
 */
interface OutcomeBase {
  readonly position: SubjectRefundPosition;
  readonly requestId: string | null;
}

/** Un constat non terminal : le remboursement attend la banque. */
export interface RefundRecordedOutcome extends OutcomeBase {
  readonly kind: "recorded";
  readonly refundId: string;
  readonly providerRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: "pending" | "requires_action";
}

/** L'argent est rendu. */
export interface RefundSucceededOutcome extends OutcomeBase {
  readonly kind: "succeeded";
  readonly refundId: string;
  readonly providerRef: string;
  readonly amountCents: number;
  readonly currency: string;
}

/** Un remboursement en attente a échoué ou été annulé : il n'a rien rendu. */
export interface RefundFailedOutcome extends OutcomeBase {
  readonly kind: "failed";
  readonly refundId: string;
  readonly providerRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: "failed" | "canceled";
}

/** **Une inversion** (§6.2) : un remboursement RÉUSSI a échoué — `succeeded → failed` seulement. */
export interface RefundReversedOutcome extends OutcomeBase {
  readonly kind: "reversed";
  readonly refundId: string;
  readonly providerRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: "failed";
}

/** Le carnet a refusé de l'écrire : pas de ligne, donc pas de `refundId`. */
export interface RefundRejectedOutcome extends OutcomeBase {
  readonly kind: "rejected";
  readonly providerRef: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly status: "pending" | "requires_action" | "succeeded" | "failed" | "canceled";
  readonly reason: "currency" | "exceeds_charge" | "amount_changed" | "reversed_after_success";
}

/** « Rendu autrement » (§5.5) : une ligne `manual`, réussie, constatée par l'équipe. */
export interface RefundSettledElsewhereOutcome extends OutcomeBase {
  readonly kind: "settled_elsewhere";
  readonly refundId: string;
  readonly amountCents: number;
  readonly staffId: string;
  readonly reason: string;
}

/** Un essai d'émission qui n'a pas rendu l'argent ; `failure` est son code brut. */
export interface RefundAttemptedOutcome extends OutcomeBase {
  readonly kind: "attempted";
  readonly generation: number;
  readonly failure: string;
  readonly providerRef: string | null;
}

/** Le prestataire a accepté la demande : ce qui était annoncé, ce qu'il a émis. */
export interface RefundIssuedOutcome extends OutcomeBase {
  readonly kind: "issued";
  readonly generation: number;
  readonly providerRef: string;
  readonly announcedCents: number;
  readonly issuedCents: number;
}

export type SubjectRefundOutcome =
  | RefundRecordedOutcome
  | RefundSucceededOutcome
  | RefundFailedOutcome
  | RefundReversedOutcome
  | RefundRejectedOutcome
  | RefundSettledElsewhereOutcome
  | RefundAttemptedOutcome
  | RefundIssuedOutcome;

type DraftOf<O> = O extends SubjectRefundOutcome ? Omit<O, "position"> : never;

/** Un genre, sans la position : ce que `card-payment` décide avant de la recalculer. */
export type SubjectRefundOutcomeDraft = DraftOf<SubjectRefundOutcome>;
