import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CardRefundRetrier } from "../refunds/card-refund-retrier.js";
import { RetryCardRefundCommand } from "./retry-card-refund.command.js";

/**
 * Délègue à `CardRefundRetrier`, que le port `CardRefunds.retry` partage :
 * sous l'ordre du §3.6, l'agrégat dit la règle, `card_payment.retried` la
 * trace sous unité de travail, l'exécuteur part après validation.
 */
@CommandHandler(RetryCardRefundCommand)
export class RetryCardRefundHandler implements ICommandHandler<RetryCardRefundCommand, void> {
  constructor(private readonly retrier: CardRefundRetrier) {}

  execute(command: RetryCardRefundCommand): Promise<void> {
    return this.retrier.retry(command.requestId);
  }
}
