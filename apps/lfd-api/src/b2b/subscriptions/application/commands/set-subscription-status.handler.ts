import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubscriptionStatusChangedEvent } from "../../domain/events/subscription-acts.events.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { SetSubscriptionStatusCommand } from "./set-subscription-status.command.js";

/**
 * Met en pause ou reprend un panier récurrent. Le mur est dans le chargement :
 * `load` ne rend l'agrégat que s'il appartient à l'acteur, sinon `404` (on ne
 * divulgue pas son existence). La transition passe par une méthode métier
 * (`pause`/`resume`) qui **refuse** un état incohérent — jamais une écriture nue.
 *
 * Journalisé dans la transaction de l'écriture (depuis le 2026-09-19) : une
 * transition refusée n'écrit rien, et un journal en panne ne suspend rien.
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
  ) {}

  async execute(command: SetSubscriptionStatusCommand): Promise<void> {
    const subscription = await this.subscriptions.load(command.subscriptionId, command.actorUserId);
    if (subscription === null) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
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
    });
  }
}
