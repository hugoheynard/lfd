import type {
  CardIncreaseAbandonCause,
  CardIncreaseProposal,
} from "../../domain/entities/card-increase-proposal.js";
import type { JournalFact } from "../../../../../platform/journal/journal-fact.js";

/**
 * **Les faits du projet de hausse** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.9) — écrits
 * dans la transaction qui écrit la transition. Le sujet est la commande, sous
 * son numéro ; aucun identifiant du prestataire.
 */

/** Le sujet des faits : la commande. */
const ORDER_SUBJECT = "order";

/** La commande d'un projet, sous son numéro : le libellé des faits. */
export interface IncreaseOrderLabel {
  readonly orderId: string;
  readonly orderNumber: string;
}

function common(proposal: CardIncreaseProposal, order: IncreaseOrderLabel) {
  return {
    subjectType: ORDER_SUBJECT,
    subjectId: order.orderId,
    base: { subjectLabel: order.orderNumber, complementCents: proposal.complementCents },
  };
}

/** Une hausse est demandée : le complément attend son paiement. */
export function increaseProposedFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  const state = proposal.toPersistence();
  return {
    type: "order.card_increase_proposed",
    subjectType,
    subjectId,
    payload: {
      ...base,
      targetTotalCents: state.targetTotalCents,
      expiresAt: state.expiresAt.toISOString(),
    },
  };
}

/** Le complément est encaissé à temps. */
export function increasePaidFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  return { type: "order.card_increase_paid", subjectType, subjectId, payload: base };
}

/** Le complément d'un projet abandonné est encaissé tard : il sera rendu. */
export function increaseClosedFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  return { type: "order.card_increase_closed", subjectType, subjectId, payload: base };
}

/** Le projet en attente de paiement est abandonné ; la cause ne va qu'au journal. */
export function increaseAbandonedFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
  cause: CardIncreaseAbandonCause,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  return {
    type: "order.card_increase_abandoned",
    subjectType,
    subjectId,
    payload: { ...base, cause },
  };
}

/** La modification est écrite : `revision` est celle qu'elle a produite. */
export function increaseAppliedFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
  revision: number,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  return {
    type: "order.card_increase_applied",
    subjectType,
    subjectId,
    payload: { ...base, revision },
  };
}

/** Plus possible : `refusal` est le code du refus métier ; le complément sera rendu. */
export function increaseRefusedFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
  refusal: string,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  return {
    type: "order.card_increase_refused",
    subjectType,
    subjectId,
    payload: { ...base, refusal },
  };
}

/** Pannes répétées : le projet attend « Relancer ». */
export function increaseStalledFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  const state = proposal.toPersistence();
  return {
    type: "order.card_increase_stalled",
    subjectType,
    subjectId,
    payload: { ...base, attempts: state.attempts, failure: state.lastFailure ?? "panne" },
  };
}

/** « Relancer » : l'équipe a rendu le projet à l'exécuteur. */
export function increaseRelaunchedFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  return { type: "order.card_increase_relaunched", subjectType, subjectId, payload: base };
}

/** Le complément à rendre l'était déjà (l'annulation de la commande a tout rendu, R11). */
export function increaseAlreadyReturnedFact(
  proposal: CardIncreaseProposal,
  order: IncreaseOrderLabel,
): JournalFact {
  const { subjectType, subjectId, base } = common(proposal, order);
  return { type: "order.card_increase_already_returned", subjectType, subjectId, payload: base };
}
