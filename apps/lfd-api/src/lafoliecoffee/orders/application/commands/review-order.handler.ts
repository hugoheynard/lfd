import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import { OrderReviewWithdrawnFact } from "../../domain/events/order-review-withdrawn.fact.js";
import { OrderReviewedFact } from "../../domain/events/order-reviewed.fact.js";
import { OrderReviewsRepository } from "../../domain/ports/order-reviews.repository.js";
import { ReviewOrderCommand } from "./review-order.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const GESTURE = "orders.review-order";

/**
 * **Viser une commande** : charger son registre de visas, viser par
 * l'agrégat (qui refuse hors périmètre et le double visa), écrire, puis
 * publier `order.reviewed` dans la même transaction — les alertes de
 * la commande s'acquittent par ce fait.
 *
 * Révisée depuis son visa, la commande voit l'ancien visa remplacé : son
 * retrait part aussi (`order.review_withdrawn`), avant le nouveau visa.
 *
 * Une fois par intention : un double clic rend le premier visa, sans en
 * créer un second ni le refuser comme « déjà visée ».
 *
 * @throws {OrderNotFoundError} commande inconnue.
 * @throws {OrderReviewOutOfScopeError} @throws {OrderAlreadyReviewedError}
 * @throws {OrderReviewNoteTooLongError} @throws {OrderReviewRaceError}
 */
@CommandHandler(ReviewOrderCommand)
export class ReviewOrderHandler implements ICommandHandler<ReviewOrderCommand, void> {
  constructor(
    private readonly reviews: OrderReviewsRepository,
    private readonly durable: DurablePublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: ReviewOrderCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: GESTURE,
        subject: intentSubject(command.orderId, command.note),
      },
      NOTHING_TO_REPLAY,
      (seal) =>
        this.uow.run(async () => {
          const registry = await this.reviews.load(command.orderId);
          if (registry === null) {
            throw new OrderNotFoundError(command.orderId);
          }
          const review = registry.review({
            id: this.ids.next(),
            byStaffId: command.staffUserId,
            note: command.note,
            at: this.clock.now(),
          });
          await this.reviews.save(registry);
          const replaced = registry.changes().withdrawn;
          if (replaced?.withdrawn) {
            await this.durable.publish(
              new OrderReviewWithdrawnFact(
                replaced.id,
                registry.order.orderId,
                registry.order.orderNumber,
                registry.order.placedByUserId,
                replaced.withdrawn.byStaffId,
                replaced.withdrawn.at,
              ).durableFact(),
            );
          }
          await this.durable.publish(
            new OrderReviewedFact(
              review.id,
              registry.order.orderId,
              registry.order.orderNumber,
              registry.order.placedByUserId,
              review.reviewedRevision,
              review.reviewedByStaffId,
              review.reviewedAt,
            ).durableFact(),
          );
          await seal(undefined);
        }),
    );
  }
}
