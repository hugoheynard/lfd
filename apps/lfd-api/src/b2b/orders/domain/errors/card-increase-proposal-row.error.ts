import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/** Une ligne `order_revision_proposal` que le code ne sait pas relire : base et code divergent. */
export class UnreadableCardIncreaseProposalError extends TechnicalError {
  constructor(proposalId: string, what: string) {
    super(
      "orders.card_increase.unreadable",
      `Le projet de hausse ${proposalId} ne se relit pas (${what}) : la base et le code divergent.`,
    );
  }
}
