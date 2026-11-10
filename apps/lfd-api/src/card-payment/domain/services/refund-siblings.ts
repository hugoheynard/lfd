import type { CardRefundRequest } from "../entities/card-refund-request.js";

/**
 * **Les demandes sœurs d'un même paiement** (plan M2, §3.4, §3.5, §7) — les
 * règles qui se lisent sur plusieurs demandes à la fois, pures.
 */

/** Une AUTRE `remainder` du même paiement est-elle en cours ? (« Relancer », §3.4, v14) */
export function anotherRemainderInProgress(
  request: CardRefundRequest,
  siblings: readonly CardRefundRequest[],
): boolean {
  return siblings.some(
    (other) =>
      other.id !== request.id &&
      other.paymentId === request.paymentId &&
      other.view.form === "remainder" &&
      other.isInProgress(),
  );
}

/** La `remainder` en cours du paiement, s'il y en a une (l'index partiel n'en admet qu'une). */
export function remainderInProgress(
  siblings: readonly CardRefundRequest[],
): CardRefundRequest | null {
  return (
    siblings.find((request) => request.view.form === "remainder" && request.isInProgress()) ?? null
  );
}

/** Une `amount` du paiement est-elle à émettre ou émise ? Le bail d'une `remainder` l'attend (§3.5). */
export function amountInProgress(siblings: readonly CardRefundRequest[]): boolean {
  return siblings.some((request) => request.view.form === "amount" && request.isInProgress());
}

/**
 * Ce qui est déjà ANNONCÉ par les `amount` non terminales (`to_issue`,
 * `issued`, `stopped`) — retranché du reste qu'une `remainder` annonce (§7) :
 * on n'annonce pas deux fois le même euro.
 */
export function announcedByOpenAmounts(siblings: readonly CardRefundRequest[]): number {
  return siblings
    .filter(
      (request) =>
        request.view.form === "amount" && (request.isInProgress() || request.current === "stopped"),
    )
    .reduce((sum, request) => sum + request.view.announcedCents, 0);
}
