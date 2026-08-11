import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { OrderPlacedEvent } from "../../../orders/domain/events/order-placed.event.js";
import { EvaluateOrderAlerts } from "./evaluate-order-alerts.service.js";

/**
 * Abonné du fait `order.placed` : évalue la commande contre les règles du compte.
 *
 * `alerts/` ne connaît d'`orders` que la **classe d'événement** — jamais ses
 * tables ni ses agrégats. Le handler ne décide rien : il passe l'identifiant, le
 * service relit ce dont il a besoin. Une commande zéro friction, une société non
 * active ou un compte sans règle active ressortent sans écriture.
 */
@EventsHandler(OrderPlacedEvent)
export class OnOrderPlacedEvaluateAlerts implements IEventHandler<OrderPlacedEvent> {
  constructor(private readonly alerts: EvaluateOrderAlerts) {}

  async handle(event: OrderPlacedEvent): Promise<void> {
    await this.alerts.evaluate(event.orderId);
  }
}
