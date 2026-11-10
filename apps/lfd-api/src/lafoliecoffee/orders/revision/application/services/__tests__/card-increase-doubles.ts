import {
  CardIncreaseProposal,
  type CardIncreaseState,
} from "../../../domain/entities/card-increase-proposal.js";
import { CardIncreaseProposalRepository } from "../../../domain/ports/card-increase-proposal.repository.js";
import { CardIncreaseWake } from "../../../domain/ports/card-increase-wake.js";
import type { Steps } from "../../../../application/services/__tests__/order-card-doubles.js";

/**
 * Doubles du projet de hausse par carte (plan S2), écrits à la main en
 * héritant des ports. La chronologie commune (`Steps`) dit l'ordre des
 * verrous : `orders` d'abord, puis le projet.
 */

/** Un projet de la commande `ord_1`, payé par `pay_2`, relu à cet état. */
export function proposalAt(state: CardIncreaseState, orderId = "ord_1"): CardIncreaseProposal {
  const born = CardIncreaseProposal.propose({
    id: "prop_1",
    orderId,
    baseRevision: 0,
    content: {},
    rules: { rulesOf: "customer" },
    totalBeforeCents: 2_340,
    targetTotalCents: 3_540,
    author: { kind: "customer", userId: "usr_1" },
    paymentId: "pay_2",
    now: new Date(0),
    cutoff: null,
  });
  return CardIncreaseProposal.rehydrate({ ...born.toPersistence(), state });
}

/** Le dépôt : un projet au plus, et ses sauvegardes, dans la chronologie. */
export class RecordingProposals extends CardIncreaseProposalRepository {
  readonly saved: CardIncreaseState[] = [];

  constructor(
    private readonly steps: Steps,
    private readonly proposal: CardIncreaseProposal | null,
    /** `false` : la condition d'état n'a rien trouvé (un autre geste est passé). */
    private readonly written = true,
  ) {
    super();
  }

  lockByPayment(paymentId: string): Promise<CardIncreaseProposal | null> {
    this.steps.seen.push(`lockProposal:${paymentId}`);
    const found = this.proposal?.toPersistence().paymentId === paymentId ? this.proposal : null;
    return Promise.resolve(found);
  }

  lockLiveOf(orderId: string): Promise<CardIncreaseProposal | null> {
    this.steps.seen.push(`lockLiveProposal:${orderId}`);
    return Promise.resolve(this.proposal?.live === true ? this.proposal : null);
  }

  save(proposal: CardIncreaseProposal): Promise<boolean> {
    this.steps.seen.push(`saveProposal:${proposal.expectedState ?? "new"}→${proposal.state}`);
    if (this.written) {
      this.saved.push(proposal.state);
    }
    return Promise.resolve(this.written);
  }
}

/** Le réveil de l'exécuteur, noté. */
export class RecordingWake extends CardIncreaseWake {
  readonly woken: string[] = [];

  wake(proposalId: string): Promise<void> {
    this.woken.push(proposalId);
    return Promise.resolve();
  }
}
