import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../platform/intent/once-per-intent.js";
import { CardRefundRetrier } from "../refunds/card-refund-retrier.js";
import { RetryCardRefundCommand } from "./retry-card-refund.command.js";

/**
 * Délègue à `CardRefundRetrier`, que le port `CardRefunds.retry` partage :
 * sous l'ordre du §3.6, l'agrégat dit la règle, `card_payment.retried` la
 * trace sous unité de travail, l'exécuteur part après validation.
 *
 * **Une fois par intention** : sujet, la demande. Une demande à émettre déjà
 * tentée accepte une relance à chaque clic — un double clic écrivait deux
 * `card_payment.retried` et réveillait deux fois l'exécuteur. La même clé ne
 * relance rien de plus ; l'intention est scellée avec le fait. L'argent,
 * lui, est tenu par la clé de la demande chez le prestataire (génération,
 * tour), que la relance d'une demande à émettre ne change pas.
 */
@CommandHandler(RetryCardRefundCommand)
export class RetryCardRefundHandler implements ICommandHandler<RetryCardRefundCommand, void> {
  constructor(
    private readonly retrier: CardRefundRetrier,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: RetryCardRefundCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: RETRY_GESTURE,
        subject: command.requestId,
      },
      NOTHING_TO_REPLAY,
      (seal) => this.retrier.retry(command.requestId, () => seal()),
    );
  }
}

/** Le nom stable du geste, dans le registre des intentions. */
const RETRY_GESTURE = "card-payment.retry-refund";
