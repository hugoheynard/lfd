import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderReviewWithdrawnFact } from "../../domain/events/order-review-withdrawn.fact.js";
import { OrderReviewsRepository } from "../../domain/ports/order-reviews.repository.js";
import { WithdrawOrderReviewCommand } from "./withdraw-order-review.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "orders.withdraw-order-review";

/**
 * **Retirer le visa en cours** : par l'agrégat (qui refuse s'il n'y en a
 * pas), puis `order.review_withdrawn` dans la même transaction. La
 * commande revient dans l'onglet « À vérifier ». Aucune alerte ne se
 * « désacquitte ».
 *
 * Une fois par intention : un double clic ne lève pas « aucun visa à
 * retirer » au second.
 *
 * @throws {OrderNotFoundError} commande inconnue.
 * @throws {OrderNotReviewedError} aucun visa en cours.
 */
@CommandHandler(WithdrawOrderReviewCommand)
export class WithdrawOrderReviewHandler implements ICommandHandler<
  WithdrawOrderReviewCommand,
  void
> {
  constructor(
    private readonly reviews: OrderReviewsRepository,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: WithdrawOrderReviewCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject(command.orderId),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const registry = await this.reviews.load(command.orderId);
          if (registry === null) {
            throw new OrderNotFoundError(command.orderId);
          }
          const withdrawn = registry.withdraw({
            byStaffId: command.staffUserId,
            at: this.clock.now(),
          });
          await this.reviews.save(registry);
          await this.durable.publish(
            new OrderReviewWithdrawnFact(
              withdrawn.id,
              registry.order.orderId,
              registry.order.orderNumber,
              registry.order.placedByUserId,
              command.staffUserId,
              this.clock.now(),
            ).durableFact(),
          );
          await seal(undefined);
        }),
    );
  }
}
