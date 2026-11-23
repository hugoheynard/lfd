import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { SUBSCRIPTION_DELETED } from "../../../account/domain/events/site-gesture.fact.js";
import {
  citedPickupPoint,
  PickupPointNames,
} from "../../../account/domain/ports/pickup-point-names.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { SubscriptionDeletedEvent } from "../../domain/events/subscription-acts.events.js";
import { SubscriptionRepository } from "../../domain/ports/subscription.repository.js";
import { SubscriptionGestures } from "../services/subscription-gestures.js";
import { DeleteSubscriptionCommand } from "./delete-subscription.command.js";

/**
 * **Arrête** un panier récurrent. Le mur est dans `loadManaged` : le panier est
 * à l'acteur, et, s'il est d'une société, l'acteur en est membre actuel (N4e).
 * Le panier reste en base au statut `cancelled` (CLAUDE.md §3, pas de DELETE
 * physique), avec ses lignes et ses dérogations, mais ne se lit plus et ne se
 * mute plus : relu, il répond comme un panier absent.
 *
 * Le fait journalisé et le fait durable de l'avis au principal (N4e) sont
 * écrits dans la transaction de l'arrêt, et leur charge vient de l'état
 * CHARGÉ avant le geste.
 */
@CommandHandler(DeleteSubscriptionCommand)
export class DeleteSubscriptionHandler implements ICommandHandler<DeleteSubscriptionCommand, void> {
  constructor(
    private readonly subscriptions: SubscriptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly gestures: SubscriptionGestures,
    private readonly pickupPoints: PickupPointNames,
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
    const decision = subscription.decision();
    // Nommé AVANT la transaction : une lecture d'un autre contexte n'a rien à
    // faire dans le verrou de la suppression.
    const pickupAddress = await citedPickupPoint(this.pickupPoints, decision.pickupAddressId);
    await this.uow.run(async () => {
      subscription.cancel();
      await this.subscriptions.save(subscription);
      await this.events.publishTraced(
        new SubscriptionDeletedEvent(command.subscriptionId, decision, pickupAddress),
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
