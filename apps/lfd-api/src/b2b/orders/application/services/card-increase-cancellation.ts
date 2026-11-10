import { Injectable } from "@nestjs/common";

import { CardPayments } from "../../../../card-payment/channels/requests/index.js";
import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { CardIncreaseProposal } from "../../domain/entities/card-increase-proposal.js";
import { CardIncreaseNotWrittenError } from "../../domain/errors/card-increase-application-errors.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import {
  increaseAbandonedFact,
  increaseRefusedFact,
  type IncreaseOrderLabel,
} from "./card-increase-facts.js";

/** Le refus d'un projet payé par l'annulation de sa commande — 🔴 une valeur écrite. */
export const ORDER_CANCELLED_REFUSAL = "order_cancelled";

/**
 * **L'annulation d'une commande qui porte un projet de hausse vivant** (plan
 * `documentation/commandes/modification/plan-s2-la-hausse.md`, R9) — dans la
 * transaction d'`OrderCancellation`, sous SON verrou `orders`, après que
 * l'annulation a franchi :
 *
 * - `awaiting_payment` ⇒ `abandoned` (cause `order_cancelled`) ; l'intention
 *   est annulée APRÈS validation (`cards.cancel`, hors transaction). Payée
 *   quand même, elle suit le chemin du paiement tardif (§2.5) ;
 * - `ready | stalled` ⇒ `refused` (`order_cancelled`) SANS remboursement
 *   propre ni e-mail : l'annulation rend ensuite TOUS les paiements encaissés
 *   (`requestRemainder` sur le sujet), complément compris.
 */
@Injectable()
export class CardIncreaseCancellation {
  constructor(
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly cards: CardPayments,
    private readonly afterCommit: AfterCommit,
    private readonly journal: Journal,
    private readonly clock: Clock,
  ) {}

  /** @throws {CardIncreaseNotWrittenError} le projet relu sous verrou ne s'écrit pas. */
  async settleOnCancellation(order: IncreaseOrderLabel): Promise<void> {
    const live = await this.proposals.lockLiveOf(order.orderId);
    if (live === null) {
      return;
    }
    if (live.state === "awaiting_payment") {
      await this.abandon(live, order);
      return;
    }
    live.refuse(ORDER_CANCELLED_REFUSAL, this.clock.now());
    await this.save(live, "refusé");
    await this.journal.append(increaseRefusedFact(live, order, ORDER_CANCELLED_REFUSAL));
  }

  private async abandon(live: CardIncreaseProposal, order: IncreaseOrderLabel): Promise<void> {
    live.abandon(this.clock.now());
    await this.save(live, "abandonné");
    await this.journal.append(increaseAbandonedFact(live, order, "order_cancelled"));
    const paymentId = live.toPersistence().paymentId;
    this.afterCommit.defer(async () => {
      await this.cards.cancel(paymentId);
    }, `card-increase.cancel-intent:${live.id}`);
  }

  private async save(live: CardIncreaseProposal, gesture: string): Promise<void> {
    // Sous `orders` puis le projet `FOR UPDATE` : la condition d'état ne peut pas manquer.
    if (!(await this.proposals.save(live))) {
      throw new CardIncreaseNotWrittenError(live.id, gesture);
    }
  }
}
