import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SubscriptionReader } from "../../domain/ports/subscription.reader.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { SetSubscriptionStatusCommand } from "./set-subscription-status.command.js";

/** Change l'état d'un panier récurrent après vérification du mur (sinon `404`). */
@CommandHandler(SetSubscriptionStatusCommand)
export class SetSubscriptionStatusHandler implements ICommandHandler<
  SetSubscriptionStatusCommand,
  void
> {
  constructor(
    private readonly reader: SubscriptionReader,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async execute(command: SetSubscriptionStatusCommand): Promise<void> {
    const owner = await this.reader.findOwner(command.subscriptionId);
    if (owner !== command.actorUserId) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    await this.subscriptions.setStatus(command.subscriptionId, command.status);
  }
}
