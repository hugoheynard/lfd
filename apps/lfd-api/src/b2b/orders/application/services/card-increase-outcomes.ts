import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { WallClock } from "../../../../platform/time/wall-clock.js";
import type { CardIncreaseProposal } from "../../domain/entities/card-increase-proposal.js";
import { OrderCardIncreaseRefusedEvent } from "../../domain/events/order-card-increase-refused.event.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { OrderLock } from "../../domain/ports/order-lock.js";
import { CardIncreaseBell } from "./card-increase-bell.js";
import { increaseRefusedFact, increaseStalledFact } from "./card-increase-facts.js";
import { IncreaseOrderLabels } from "./increase-order-labels.js";

/**
 * La courbe de reprise après une panne (§2.6, étape 5), par essai déjà fait :
 * 1 min, 5 min, 15 min, 1 h. Le 5ᵉ échec ne reprend pas : `stalled`.
 */
export const CARD_INCREASE_RETRY_DELAYS_MS: readonly number[] = [
  60_000,
  5 * 60_000,
  15 * 60_000,
  60 * 60_000,
];

/** Le texte d'une panne gardé en base, borné : un message, pas une pile. */
const FAILURE_MAX_LENGTH = 500;

/**
 * **Les issues d'un projet que l'exécuteur n'a pas appliqué** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5 étapes 4 et 5) — chacune dans SA transaction, après celle qui a échoué : l'ordre des
 * verrous (`orders`, puis le projet `FOR UPDATE`), une transition
 * conditionnée, son journal (R12). Un projet qui n'est plus `ready | stalled`
 * n'est pas touché : un autre geste est passé.
 */
@Injectable()
export class CardIncreaseOutcomes {
  constructor(
    private readonly lock: OrderLock,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly labels: IncreaseOrderLabels,
    private readonly journal: Journal,
    private readonly durable: DurablePublisher,
    private readonly bell: CardIncreaseBell,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly wall: WallClock,
  ) {}

  /**
   * **Refus métier** (étape 4) : `refused` + `refusal`, et le fait durable
   * `order.card_increase_refused` — l'abonné `RefundRefusedIncrease` rend le
   * complément et prévient le client, après validation.
   */
  refuse(proposalId: string, orderId: string, refusal: string): Promise<void> {
    return this.unitOfWork.run(async () => {
      const proposal = await this.relock(proposalId, orderId);
      if (proposal === null) {
        return;
      }
      proposal.refuse(refusal, this.clock.now());
      if (!(await this.proposals.save(proposal))) {
        return;
      }
      await this.journal.append(
        increaseRefusedFact(proposal, await this.labels.of(orderId), refusal),
      );
      const state = proposal.toPersistence();
      await this.durable.publish(
        new OrderCardIncreaseRefusedEvent(
          orderId,
          proposal.id,
          state.paymentId,
          state.complementCents,
          refusal,
        ).durableFact(),
      );
    });
  }

  /**
   * **Panne** (étape 5) : un essai de plus, le prochain sur la courbe ; au
   * 5ᵉ, `stalled`, son journal et la cloche. Les échéances sont au MUR : le
   * bail et le balayage les y comparent.
   */
  fail(proposalId: string, orderId: string, failure: string): Promise<void> {
    return this.unitOfWork.run(async () => {
      const proposal = await this.relock(proposalId, orderId);
      if (proposal === null || proposal.state !== "ready") {
        return;
      }
      const retryAt = new Date(this.wall.elapsedNow().getTime() + retryDelayOf(proposal));
      const stalled = proposal.recordFailure(failure.slice(0, FAILURE_MAX_LENGTH), retryAt);
      if (!(await this.proposals.save(proposal)) || !stalled) {
        return;
      }
      const label = await this.labels.of(orderId);
      await this.journal.append(increaseStalledFact(proposal, label));
      await this.bell.ring(proposal, label, "stalled");
    });
  }

  /** `orders`, puis le projet vivant `FOR UPDATE` — celui-ci, `ready` ou `stalled`, sinon `null`. */
  private async relock(proposalId: string, orderId: string): Promise<CardIncreaseProposal | null> {
    await this.lock.lock(orderId);
    const live = await this.proposals.lockLiveOf(orderId);
    if (live === null || live.id !== proposalId || live.state === "awaiting_payment") {
      return null;
    }
    return live;
  }
}

/** Le délai avant le prochain essai, d'après les essais déjà faits ; le dernier palier au-delà. */
function retryDelayOf(proposal: CardIncreaseProposal): number {
  const last = CARD_INCREASE_RETRY_DELAYS_MS.length - 1;
  return CARD_INCREASE_RETRY_DELAYS_MS[Math.min(proposal.toPersistence().attempts, last)] ?? 0;
}
