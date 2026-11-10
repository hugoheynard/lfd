import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { OrderPlacedEvent } from "../../../orders/domain/events/order-placed.event.js";
import { EvaluateOrderAlerts } from "./evaluate-order-alerts.service.js";

/**
 * Abonné du fait `order.placed` : évalue la commande contre les règles du compte.
 *
 * `alerts/` ne connaît d'`orders` que la **classe d'événement** — jamais ses
 * tables ni ses agrégats. Le handler ne décide rien : il passe l'identifiant, le
 * service relit ce dont il a besoin. Une commande zéro friction, une société non
 * active ou un compte sans règle active ressortent sans écriture.
 *
 * L'évaluation passe par `BackgroundWork` : la requête HTTP qui a provoqué
 * l'événement est déjà repartie, donc personne n'attrape une erreur ici — et
 * personne ne sait non plus quand c'est terminé. Ce passage règle les deux.
 */
@EventsHandler(OrderPlacedEvent)
export class OnOrderPlacedEvaluateAlerts implements IEventHandler<OrderPlacedEvent> {
  constructor(
    private readonly alerts: EvaluateOrderAlerts,
    private readonly work: BackgroundWork,
  ) {}

  async handle(event: OrderPlacedEvent): Promise<void> {
    await this.work.track(this.alerts.evaluate(event.orderId), "alerts:order.placed");
  }
}
