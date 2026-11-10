import type {
  CardIncreaseAbandonCause,
  CardIncreaseProposal,
} from "../../domain/entities/card-increase-proposal.js";
import type { JournalFact } from "../../../../platform/journal/journal-fact.js";

/**
 * **Les faits du projet de hausse** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, R12) — écrits
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
