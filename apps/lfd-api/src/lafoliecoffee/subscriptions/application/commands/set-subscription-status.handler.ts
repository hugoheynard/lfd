import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SUBSCRIPTION_STATUS_CHANGED } from "../../../account/domain/events/site-gesture.fact.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubscriptionStatusChangedEvent } from "../../domain/events/subscription-acts.events.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { SubscriptionGestures } from "../services/subscription-gestures.js";
import { SetSubscriptionStatusCommand } from "./set-subscription-status.command.js";

/**
 * Met en pause ou reprend un panier récurrent. Le mur est dans le chargement :
 * `loadManaged` ne rend l'agrégat que s'il appartient à l'acteur (sinon `404`,
 * on ne divulgue pas son existence) et, pour un panier de société, que si
 * l'acteur en est membre actuel (N4e). La transition passe par une méthode métier
 * (`pause`/`resume`) qui **refuse** un état incohérent — jamais une écriture nue.
 *
 * Journalisé dans la transaction de l'écriture (depuis le 2026-09-19) : une
 * transition refusée n'écrit rien, et un journal en panne ne suspend rien.
 * Le principal du site est prévenu de la pause comme de la reprise (N4e,
 * décision de Hugo du 2026-10-20), par un fait durable de la même transaction.
 */
@CommandHandler(SetSubscriptionStatusCommand)
export class SetSubscriptionStatusHandler implements ICommandHandler<
  SetSubscriptionStatusCommand,
  void
> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly gestures: SubscriptionGestures,
  ) {}

  async execute(command: SetSubscriptionStatusCommand): Promise<void> {
    const subscription = await this.gestures.loadManaged(
      command.subscriptionId,
      command.actorUserId,
    );
    const before = subscription.currentStatus;
    if (command.status === "paused") {
      subscription.pause();
    } else {
      subscription.resume();
    }
    await this.uow.run(async () => {
      await this.subscriptions.save(subscription);
      await this.events.publishTraced(
        new SubscriptionStatusChangedEvent(
          command.subscriptionId,
          before,
          subscription.currentStatus,
        ),
      );
      await this.gestures.announce({
        type: SUBSCRIPTION_STATUS_CHANGED,
        subscription,
        subscriptionId: command.subscriptionId,
        actorUserId: command.actorUserId,
        status: subscription.currentStatus,
      });
    });
  }
}
