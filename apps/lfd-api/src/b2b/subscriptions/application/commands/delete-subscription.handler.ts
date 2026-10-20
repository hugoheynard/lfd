import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SUBSCRIPTION_DELETED } from "../../../account/domain/events/site-gesture.fact.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubscriptionDeletedEvent } from "../../domain/events/subscription-acts.events.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { SubscriptionGestures } from "../services/subscription-gestures.js";
import { DeleteSubscriptionCommand } from "./delete-subscription.command.js";

/**
 * Supprime un panier récurrent. Le mur est dans `loadManaged` : le panier est à
 * l'acteur, et, s'il est d'une société, l'acteur en est membre actuel (N4e).
 * La suppression reste physique (lignes + dérogations en cascade) — à faire
 * évoluer en statut `cancelled` quand le planificateur existera (cf. règle
 * « pas de DELETE physique sur les agrégats »).
 *
 * Parce que la ligne disparaît, le fait journalisé et le fait durable de l'avis
 * au principal (N4e) sont écrits dans la transaction de la suppression, et
 * leur charge vient de l'état CHARGÉ avant le geste : la ligne n'est jamais
 * relue. L'avis « arrêté » est alors la seule trace côté principal ; il relève
 * de la purge à douze mois décidée pour ces avis (non bâtie).
 */
@CommandHandler(DeleteSubscriptionCommand)
export class DeleteSubscriptionHandler implements ICommandHandler<DeleteSubscriptionCommand, void> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly gestures: SubscriptionGestures,
  ) {}

  /**
   * @throws {SubscriptionNotFoundError} inconnu, ou pas à cette personne.
   * @throws {SubscriptionSiteMembershipLostError} panier d'une société quittée.
   */
  async execute(command: DeleteSubscriptionCommand): Promise<void> {
    const subscription = await this.gestures.loadManaged(
      command.subscriptionId,
      command.actorUserId,
    );
    await this.uow.run(async () => {
      await this.subscriptions.remove(command.subscriptionId);
      await this.events.publishTraced(
        new SubscriptionDeletedEvent(command.subscriptionId, subscription.decision()),
      );
      await this.gestures.announce({
        type: SUBSCRIPTION_DELETED,
        subscription,
        subscriptionId: command.subscriptionId,
        actorUserId: command.actorUserId,
      });
    });
  }
}
