import type { JournalFact } from "../../../platform/journal/journal-fact.js";
import type { CardRefundRequest } from "../../domain/entities/card-refund-request.js";

/**
 * **Les faits de journal de `card-payment`** (plan M2, §3.3) — sous le sujet
 * `card_payment`, la demande en identifiant, le sujet de l'argent en libellé
 * (`describe`). Aucun identifiant du prestataire dans la charge (catalogue
 * `packages/contracts/src/journal-facts/card-payment.ts`).
 */
const SUBJECT = "card_payment";

function about(request: CardRefundRequest): { subjectType: string; subjectId: string } {
  return { subjectType: SUBJECT, subjectId: request.id };
}

/** Le prestataire a accepté la demande. */
export function issuedFact(request: CardRefundRequest, label: string): JournalFact {
  const { generation, announcedCents, issuedCents } = request.view;
  return {
    type: "card_payment.issued",
    ...about(request),
    payload: {
      subjectLabel: label,
      generation,
      announcedCents,
      issuedCents: issuedCents ?? announcedCents,
    },
  };
}

/** Un essai sans réponse : le système réessaie seul. */
export function attemptFailedFact(request: CardRefundRequest, label: string): JournalFact {
  return {
    type: "card_payment.attempt_failed",
    ...about(request),
    payload: {
      subjectLabel: label,
      generation: request.generation,
      failure: request.view.lastFailure ?? "unavailable",
    },
  };
}

/** La demande s'arrête, sous le code de son dernier échec. */
export function stoppedFact(request: CardRefundRequest, label: string): JournalFact {
  return {
    type: "card_payment.stopped",
    ...about(request),
    payload: {
      subjectLabel: label,
      generation: request.generation,
      failure: request.view.lastFailure ?? "stopped",
    },
  };
}

/** « Relancer ». */
export function retriedFact(request: CardRefundRequest, label: string): JournalFact {
  return {
    type: "card_payment.retried",
    ...about(request),
    payload: { subjectLabel: label, generation: request.generation },
  };
}

/** « Rendu autrement ». */
export function settledElsewhereFact(
  request: CardRefundRequest,
  label: string,
  amountCents: number,
): JournalFact {
  return {
    type: "card_payment.settled_elsewhere",
    ...about(request),
    payload: { subjectLabel: label, amountCents, reason: request.view.settledReason ?? "" },
  };
}

/** Un événement du prestataire hors de nos sujets. */
export function unmatchedFact(account: string, eventId: string, eventType: string): JournalFact {
  return {
    type: "card_payment.unmatched",
    subjectType: SUBJECT,
    subjectId: `${account}:${eventId}`,
    payload: { account, eventType },
  };
}
