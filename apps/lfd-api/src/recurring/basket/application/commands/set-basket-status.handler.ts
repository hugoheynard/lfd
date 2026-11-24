import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  RECURRING_BASKET_PAUSED,
  RECURRING_BASKET_RESUMED,
} from "../../../channels/commerce/basket-facts.js";
import { OccurrencePlanner } from "../../../occurrence/application/services/occurrence-planner.js";
import { SubscriptionStatusChangedEvent } from "../../domain/events/basket-acts.events.js";
import { BasketRepository } from "../../domain/ports/basket.repository.js";
import { BasketFacts } from "../services/basket-facts.js";
import { BasketGestures } from "../services/basket-gestures.js";
import { parisDay } from "../services/paris-day.js";
import { SetBasketStatusCommand } from "./set-basket-status.command.js";

/**
 * **Met en pause ou reprend** un panier. Le mur est dans `loadManaged` ; la
 * transition passe par l'agrégat, qui refuse un état incohérent.
 *
 * La pause ne touche pas les échéances : le balayage ne passe que celles
 * d'un panier actif. La reprise annule les échéances prévues ou refusées
 * d'avant son jour (de Paris), puis la création à l'avance reprend — dans la
 * transaction du statut, avec son fait au journal et son fait durable
 * (`recurring.basket_paused` ou `_resumed`).
 */
@CommandHandler(SetBasketStatusCommand)
export class SetBasketStatusHandler implements ICommandHandler<SetBasketStatusCommand, void> {
  constructor(
    private readonly baskets: BasketRepository,
    private readonly planner: OccurrencePlanner,
    private readonly gestures: BasketGestures,
    private readonly facts: BasketFacts,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetBasketStatusCommand): Promise<void> {
    const basket = await this.gestures.loadManaged(command.basketId, command.actorUserId);
    const before = basket.currentStatus;
    if (command.status === "paused") {
      basket.pause();
    } else {
      basket.resume();
    }
    const at = this.clock.now();
    await this.uow.run(async () => {
      if (command.status === "active") {
        await this.planner.resume(basket, parisDay(at), at);
      }
      await this.baskets.save(basket, at);
      await this.events.publishTraced(
        new SubscriptionStatusChangedEvent(basket.id, before, basket.currentStatus),
      );
      await this.facts.publish(
        command.status === "paused" ? RECURRING_BASKET_PAUSED : RECURRING_BASKET_RESUMED,
        basket,
      );
    });
  }
}
