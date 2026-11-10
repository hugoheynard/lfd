import type { JournalFact } from "../../../../platform/journal/journal-fact.js";

/** Le sujet des faits de remboursement : la commande, sous son numéro. */
const ORDER_SUBJECT = "order";

/**
 * Un essai d'émission qui n'a pas rendu l'argent (lot C4, C4.8) : la trace
 * d'un argent non rendu doit être opposable. `failure` est le code lisible
 * de la demande (`unavailable`, `declined:<code>`…), jamais un message brut.
 */
export function attemptFailedFact(
  orderId: string,
  orderNumber: string,
  generation: number,
  failure: string,
): JournalFact {
  return {
    type: "order.refund_attempt_failed",
    subjectType: ORDER_SUBJECT,
    subjectId: orderId,
    payload: { subjectLabel: orderNumber, generation, failure },
  };
}

/**
 * Stripe a rendu un autre montant que celui promis à l'annulation (lot C4,
 * C4.4) : un remboursement partiel fait entre-temps depuis le tableau de bord.
 * Sans identifiant Stripe, comme les autres faits de remboursement.
 */
export function issuedDifferentlyFact(
  orderId: string,
  orderNumber: string,
  announcedCents: number,
  issuedCents: number,
): JournalFact {
  return {
    type: "order.refund_issued",
    subjectType: ORDER_SUBJECT,
    subjectId: orderId,
    payload: { subjectLabel: orderNumber, announcedCents, issuedCents },
  };
}
