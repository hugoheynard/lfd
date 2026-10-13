import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Journal } from "../../../../platform/journal/journal.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { nextAttemptAt } from "../../../../platform/outbox/retry-policy.js";
import { Clock } from "../../../../platform/time/clock.js";
import { WallClock } from "../../../../platform/time/wall-clock.js";
import type { IssuedRefund, RefundIssuance } from "../../../payments/domain/payment-refunder.js";
import type { OrderRefundLedger } from "../../domain/entities/order-refund-ledger.js";
import type { OrderRefundRequest } from "../../domain/entities/order-refund-request.js";
import { RefundRejectedError } from "../../domain/errors/order-refund-errors.js";
import { OrderRefundRejectedEvent } from "../../domain/events/order-refund-rejected.event.js";
import { OrderRefundSucceededFact } from "../../domain/events/order-refund-succeeded.fact.js";
import { OrderRefundRequestRepository } from "../../domain/ports/order-refund-request.repository.js";
import { OrderRefundRepository } from "../../domain/ports/order-refund.repository.js";
import {
  attemptFailedFact,
  issuedDifferentlyFact,
  recordedFacts,
  rejectedFact,
} from "./order-refund-facts.js";
import { RefundAttentionBell, type RefundAttentionCause } from "./refund-attention-bell.js";

/** Ce que l'exécuteur a obtenu de Stripe, avec la génération qu'il visait. */
export interface IssuanceAttempt {
  readonly orderId: string;
  readonly token: string;
  readonly generation: number;
  readonly issuance: RefundIssuance;
}

/**
 * **L'issue d'un appel de remboursement, écrite** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C4.7, étape 3).
 *
 * Une transaction courte : le carnet sous le verrou de la ligne `orders`, puis
 * la demande RELUE sous ce verrou. Si le jeton n'est plus le nôtre ou si la
 * génération a changé, rien n'est écrit de la demande — le constat au carnet,
 * lui, est fait : il est idempotent. Aucune issue ne lève ; chacune laisse sa
 * trace. Rend l'événement « remboursement refusé » à publier APRÈS
 * validation, ou `null`.
 */
@Injectable()
export class RefundIssuanceRecorder {
  constructor(
    private readonly ledgers: OrderRefundRepository,
    private readonly requests: OrderRefundRequestRepository,
    private readonly unitOfWork: UnitOfWork,
    private readonly journal: Journal,
    private readonly durable: DurablePublisher,
    private readonly bell: RefundAttentionBell,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly wall: WallClock,
  ) {}

  record(attempt: IssuanceAttempt): Promise<OrderRefundRejectedEvent | null> {
    return this.unitOfWork.run(async () => {
      const ledger = await this.ledgers.loadByOrder(attempt.orderId);
      const loaded = await this.requests.load(attempt.orderId);
      if (ledger === null || loaded === null) {
        return null;
      }
      const request =
        loaded.isHeldBy(attempt.token) && loaded.generation === attempt.generation ? loaded : null;
      const rejected = await this.apply(attempt.issuance, ledger, request);
      if (request !== null) {
        request.release();
        await this.requests.save(request);
      }
      return rejected;
    });
  }

  private async apply(
    issuance: RefundIssuance,
    ledger: OrderRefundLedger,
    request: OrderRefundRequest | null,
  ): Promise<OrderRefundRejectedEvent | null> {
    switch (issuance.kind) {
      case "issued":
        return this.issued(issuance.refund, ledger, request);
      case "nothing_left":
        // Le carnet dit le reste nul : la demande se LIT remboursée (C4.5).
        if (request !== null && ledger.position().refundableCents > 0) {
          await this.stop(ledger, request, "nothing_left", "nothing_left");
        }
        return null;
      case "declined":
        if (request !== null) {
          await this.stop(ledger, request, `declined:${issuance.code}`, "declined");
        }
        return null;
      case "unavailable":
        if (request !== null) {
          await this.unavailable(ledger, request);
        }
        return null;
    }
  }

  /** Exactement ce que fait le webhook : `ledger.record`, puis l'id posé sur la demande. */
  private async issued(
    refund: IssuedRefund,
    ledger: OrderRefundLedger,
    request: OrderRefundRequest | null,
  ): Promise<OrderRefundRejectedEvent | null> {
    const report = {
      stripeRefundId: refund.refundId,
      amountCents: refund.amountCents,
      currency: refund.currency,
      status: refund.status,
      refundedAt: refund.createdAt,
    };
    try {
      const recorded = ledger.record(report, this.ids.next(), this.clock.now());
      if (recorded.kind === "recorded") {
        await this.ledgers.save(ledger);
        for (const fact of recordedFacts(ledger, recorded)) {
          await this.journal.append(fact);
        }
        if (recorded.refund.status === "succeeded") {
          await this.durable.publish(
            new OrderRefundSucceededFact(ledger.orderId, recorded.refund.id).durableFact(),
          );
        }
      }
    } catch (error) {
      if (!(error instanceof RefundRejectedError)) {
        throw error;
      }
      // Comme le webhook (`record-order-refund.handler.ts`) : journal, cloche
      // existante, et plus de rejeu automatique.
      await this.journal.append(rejectedFact(ledger, report, error.reason));
      request?.stopped(this.clock.now(), `rejected:${error.reason}`);
      return new OrderRefundRejectedEvent(
        ledger.orderId,
        ledger.orderNumber,
        refund.refundId,
        refund.amountCents,
        error.reason,
      );
    }
    if (request !== null && request.issued(refund.refundId, this.clock.now())) {
      if (refund.amountCents !== request.announcedCents) {
        await this.journal.append(
          issuedDifferentlyFact(
            ledger.orderId,
            ledger.orderNumber,
            request.announcedCents,
            refund.amountCents,
          ),
        );
      }
    }
    return null;
  }

  /** Rejouer ne changerait rien : trace, cloche, plus de reprise. */
  private async stop(
    ledger: OrderRefundLedger,
    request: OrderRefundRequest,
    failure: string,
    cause: RefundAttentionCause,
  ): Promise<void> {
    request.stopped(this.clock.now(), failure);
    await this.trace(ledger, request, failure, cause);
  }

  /** Stripe n'a pas répondu : un round de plus, la reprise sur la courbe de la boîte d'envoi. */
  private async unavailable(ledger: OrderRefundLedger, request: OrderRefundRequest): Promise<void> {
    const retryAt = nextAttemptAt(request.attempts + 1, this.wall.elapsedNow());
    const first = request.unavailable(this.clock.now(), retryAt);
    await this.journal.append(
      attemptFailedFact(ledger.orderId, ledger.orderNumber, request.generation, "unavailable"),
    );
    if (first) {
      await this.ringFor(ledger, request, "unavailable");
    }
  }

  private async trace(
    ledger: OrderRefundLedger,
    request: OrderRefundRequest,
    failure: string,
    cause: RefundAttentionCause,
  ): Promise<void> {
    await this.journal.append(
      attemptFailedFact(ledger.orderId, ledger.orderNumber, request.generation, failure),
    );
    await this.ringFor(ledger, request, cause);
  }

  private ringFor(
    ledger: OrderRefundLedger,
    request: OrderRefundRequest,
    cause: RefundAttentionCause,
  ): Promise<void> {
    return this.bell.ring({
      orderId: ledger.orderId,
      orderNumber: ledger.orderNumber,
      generation: request.generation,
      announcedCents: request.announcedCents,
      cause,
    });
  }
}
