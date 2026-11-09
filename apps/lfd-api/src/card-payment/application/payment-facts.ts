import type { CardPaymentFactSubject } from "../channels/facts/index.js";
import type { CardSubject } from "../channels/subjects/index.js";
import type { CardPayment } from "../domain/entities/card-payment.js";

/** Le sujet d'un paiement, tel que le canal retour le reçoit. */
export function subjectOf(payment: CardPayment): CardSubject {
  return { type: payment.subject.type, id: payment.subject.id };
}

/**
 * Ce que les faits disent d'un paiement. Un paiement que le webhook a
 * retrouvé porte toujours sa référence : c'est par elle qu'il l'a retrouvé.
 */
export function factSubjectOf(payment: CardPayment, providerRef: string): CardPaymentFactSubject {
  return {
    paymentId: payment.id,
    account: payment.account.name,
    providerRef: payment.providerRef ?? providerRef,
    subjectType: payment.subject.type,
    subjectId: payment.subject.id,
    role: payment.role,
    amountCents: payment.amountCents,
  };
}
