import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { WallClock } from "../../../platform/time/wall-clock.js";
import { CardRefundRequestNotFoundError } from "../../domain/errors/card-refund-errors.js";
import { CardRefundRequestRepository } from "../../domain/ports/card-refund-request.repository.js";
import { anotherRemainderInProgress } from "../../domain/services/refund-siblings.js";
import { retriedFact } from "./card-refund-journal.js";
import { CardRefundDispatch } from "./card-refund-dispatch.js";
import { CardRefundEffectsWriter, RefundEffects } from "./card-refund-effects.js";
import { CardRefundScope } from "./card-refund-scope.js";

/**
 * **« Relancer »** (plan M2, §3.4, v13) — partagé par la route d'équipe
 * (`RetryCardRefundCommand`) et le port `CardRefunds.retry`. Sous l'ordre du
 * §3.6 : le sujet, le paiement, puis la demande relue ; l'agrégat dit la
 * règle (`retry`), le journal la trace, l'exécuteur part après validation.
 * L'échéance se pose à l'horloge MURALE : le balayage la compare au mur.
 */
@Injectable()
export class CardRefundRetrier {
  constructor(
    private readonly scope: CardRefundScope,
    private readonly requests: CardRefundRequestRepository,
    private readonly effects: CardRefundEffectsWriter,
    private readonly dispatch: CardRefundDispatch,
    private readonly wall: WallClock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * `seal` est appelé dans la transaction de la relance : l'intention d'un
   * geste de l'équipe y est résolue avec le fait qu'elle écrit.
   *
   * @throws {CardRefundRequestNotFoundError} demande inconnue.
   * @throws {CardRefundRetryRefusedError} la règle de « Relancer » la refuse.
   */
  retry(requestId: string, seal: () => Promise<void> = NO_SEAL): Promise<void> {
    return this.uow.run(async () => {
      const paymentId = await this.requests.paymentOf(requestId);
      const locked = paymentId === null ? null : await this.scope.lock(paymentId);
      const request = locked === null ? null : await this.requests.load(requestId);
      if (locked === null || request === null) {
        throw new CardRefundRequestNotFoundError(requestId);
      }
      const siblings = await this.requests.ofPayment(request.paymentId);
      request.retry(this.wall.elapsedNow(), anotherRemainderInProgress(request, siblings));
      await this.requests.save(request);
      const effects = new RefundEffects();
      effects.journal((label) => retriedFact(request, label));
      await this.effects.flush(locked, effects);
      await seal();
      this.dispatch.afterCommitFor(requestId);
    });
  }
}

/** Une relance sans intention à sceller (le port `CardRefunds.retry`). */
const NO_SEAL = (): Promise<void> => Promise.resolve();
