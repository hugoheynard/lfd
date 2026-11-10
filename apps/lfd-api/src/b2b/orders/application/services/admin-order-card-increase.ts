import type { AdminCardIncreaseState, AdminOrderCardIncrease } from "@lfd/contracts";

import type {
  CardIncreaseProposal,
  CardIncreaseState,
} from "../../domain/entities/card-increase-proposal.js";

/**
 * **Le projet vivant, dans la forme de la fiche staff** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, §2.8). Un
 * projet terminé n'a rien à montrer ici : `null`, comme l'absence de projet —
 * le lecteur (`liveOf`) n'en rend d'ailleurs pas.
 */
export function adminCardIncreaseOf(
  proposal: CardIncreaseProposal | null,
): AdminOrderCardIncrease | null {
  if (proposal === null) {
    return null;
  }
  const { state, complementCents, expiresAt, refusal } = proposal.toPersistence();
  if (!isLive(state)) {
    return null;
  }
  return { complementCents, state, expiresAt: expiresAt.toISOString(), refusal };
}

function isLive(state: CardIncreaseState): state is AdminCardIncreaseState {
  return state === "awaiting_payment" || state === "ready" || state === "stalled";
}
