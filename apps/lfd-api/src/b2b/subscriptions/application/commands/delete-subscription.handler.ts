import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { DeleteSubscriptionCommand } from "./delete-subscription.command.js";

/**
 * Supprime un panier récurrent. Le mur est dans `load` : on ne rend l'agrégat que
 * s'il appartient à l'acteur, sinon `404`. La suppression reste physique (lignes +
 * dérogations en cascade) — à faire évoluer en statut `cancelled` quand le
 * planificateur existera (cf. règle « pas de DELETE physique sur les agrégats »).
 */
@CommandHandler(DeleteSubscriptionCommand)
export class DeleteSubscriptionHandler implements ICommandHandler<DeleteSubscriptionCommand, void> {
  constructor(private readonly subscriptions: SubscriptionRepository) {}

  async execute(command: DeleteSubscriptionCommand): Promise<void> {
    const subscription = await this.subscriptions.load(command.subscriptionId, command.actorUserId);
    if (subscription === null) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    await this.subscriptions.remove(command.subscriptionId);
  }
}
