import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { SetSubscriptionStatusCommand } from "./set-subscription-status.command.js";

/**
 * Met en pause ou reprend un panier récurrent. Le mur est dans le chargement :
 * `load` ne rend l'agrégat que s'il appartient à l'acteur, sinon `404` (on ne
 * divulgue pas son existence). La transition passe par une méthode métier
 * (`pause`/`resume`) qui **refuse** un état incohérent — jamais une écriture nue.
 */
@CommandHandler(SetSubscriptionStatusCommand)
export class SetSubscriptionStatusHandler implements ICommandHandler<
  SetSubscriptionStatusCommand,
  void
> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(command: SetSubscriptionStatusCommand): Promise<void> {
    const subscription = await this.subscriptions.load(command.subscriptionId, command.actorUserId);
    if (subscription === null) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    if (command.status === "paused") {
      subscription.pause();
    } else {
      subscription.resume();
    }
    await this.subscriptions.save(subscription);
  }
}
