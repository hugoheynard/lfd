import { orderRevisionQuotePayloadSchema } from "@lfd/contracts";

import type { CardIncreaseProposal } from "../../revision/domain/entities/card-increase-proposal.js";
import { UnreadableCardIncreaseProposalError } from "../../revision/domain/errors/card-increase-proposal-row.error.js";
import type { OrderContent } from "./order-content.js";

/**
 * **Le contenu figé d'un projet, relu en commande voulue** (plan S2, §2.6
 * étape 2). Le projet l'a rangé tel que la porte HTTP l'avait validé
 * (`cardIncreasePayloadSchema`, sans la révision ni le total vu) : il se
 * relit par la même forme, et un écart est une divergence de la base, jamais
 * un refus du client.
 *
 * @throws {UnreadableCardIncreaseProposalError} le `jsonb` n'a plus la forme d'un panier.
 */
export function frozenOrderContentOf(proposal: CardIncreaseProposal): OrderContent {
  const parsed = orderRevisionQuotePayloadSchema.safeParse(proposal.toPersistence().content);
  if (!parsed.success) {
    throw new UnreadableCardIncreaseProposalError(proposal.id, "contenu saisi");
  }
  return parsed.data;
}
