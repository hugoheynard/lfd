import { NotFoundException } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubscriptionDeletedEvent } from "../../domain/events/subscription-acts.events.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { DeleteSubscriptionCommand } from "./delete-subscription.command.js";

/**
 * Supprime un panier récurrent. Le mur est dans `load` : on ne rend l'agrégat que
 * s'il appartient à l'acteur, sinon `404`. La suppression reste physique (lignes +
 * dérogations en cascade) — à faire évoluer en statut `cancelled` quand le
 * planificateur existera (cf. règle « pas de DELETE physique sur les agrégats »).
 *
 * Parce que la ligne disparaît, le fait journalisé (depuis le 2026-09-19, dans
 * la transaction de la suppression) porte ce que le panier décidait : sans lui,
 * la décision disparaîtrait avec elle.
 */
@CommandHandler(DeleteSubscriptionCommand)
export class DeleteSubscriptionHandler implements ICommandHandler<DeleteSubscriptionCommand, void> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DeleteSubscriptionCommand): Promise<void> {
    const subscription = await this.subscriptions.load(command.subscriptionId, command.actorUserId);
    if (subscription === null) {
      throw new NotFoundException("Panier récurrent introuvable.");
    }
    await this.uow.run(async () => {
      await this.subscriptions.remove(command.subscriptionId);
      await this.events.publishTraced(
        new SubscriptionDeletedEvent(command.subscriptionId, subscription.decision()),
      );
    });
  }
}
