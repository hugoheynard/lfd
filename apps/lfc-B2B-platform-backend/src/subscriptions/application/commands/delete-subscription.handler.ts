import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SubscriptionReader } from "../../domain/ports/subscription.reader.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { DeleteSubscriptionCommand } from "./delete-subscription.command.js";

/** Supprime un panier récurrent après vérification du mur (sinon `404`). */
@CommandHandler(DeleteSubscriptionCommand)
export class DeleteSubscriptionHandler implements ICommandHandler<DeleteSubscriptionCommand, void> {
  constructor(
    private readonly reader: SubscriptionReader,
    private readonly subscriptions: SubscriptionRepository,
  ) {}

  async execute(command: DeleteSubscriptionCommand): Promise<void> {
    const owner = await this.reader.findOwner(command.subscriptionId);
    if (owner !== command.actorUserId) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    await this.subscriptions.remove(command.subscriptionId);
  }
}
