import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BasketPickupPoints } from "../../../channels/commerce/basket-pickup-points.js";
import { RECURRING_BASKET_STOPPED } from "../../../channels/commerce/basket-facts.js";
import { OccurrencePlanner } from "../../../occurrence/application/services/occurrence-planner.js";
import {
  pickupPointRef,
  SubscriptionDeletedEvent,
} from "../../domain/events/basket-acts.events.js";
import { BasketRepository } from "../../domain/ports/basket.repository.js";
import { BasketFacts } from "../services/basket-facts.js";
import { BasketGestures } from "../services/basket-gestures.js";
import { StopBasketCommand } from "./stop-basket.command.js";

/**
 * **Arrête** un panier. Il reste en base au statut `cancelled` (pas de DELETE
 * physique) ; ses échéances prévues, sautées ou refusées passent `cancelled`
 * dans la même transaction, en gardant la cause d'un refus antérieur. Relu, il
 * répond comme un panier absent.
 *
 * Le fait au journal porte ce que le panier décidait, lu AVANT le geste ; le
 * fait durable `recurring.basket_stopped` part dans la même transaction.
 */
@CommandHandler(StopBasketCommand)
export class StopBasketHandler implements ICommandHandler<StopBasketCommand, void> {
  constructor(
    private readonly baskets: BasketRepository,
    private readonly planner: OccurrencePlanner,
    private readonly gestures: BasketGestures,
    private readonly facts: BasketFacts,
    private readonly pickupPoints: BasketPickupPoints,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {SubscriptionNotFoundError} inconnu, déjà arrêté, ou pas à cette personne.
   * @throws {SubscriptionSiteMembershipLostError} panier d'une société quittée.
   */
  async execute(command: StopBasketCommand): Promise<void> {
    const basket = await this.gestures.loadManaged(command.basketId, command.actorUserId);
    const decision = basket.decision();
    // Nommé AVANT la transaction : une lecture d'un autre bloc n'a rien à
    // faire dans le verrou de l'arrêt.
    const pointId = decision.pickupAddressId;
    const pickupAddress = pickupPointRef(
      pointId,
      pointId === null ? null : await this.pickupPoints.nameOf(pointId),
    );
    const at = this.clock.now();
    await this.uow.run(async () => {
      basket.cancel();
      await this.planner.stop(basket, at);
      await this.baskets.save(basket, at);
      await this.events.publishTraced(
        new SubscriptionDeletedEvent(basket.id, decision, pickupAddress),
      );
      await this.facts.publish(RECURRING_BASKET_STOPPED, basket);
    });
  }
}
