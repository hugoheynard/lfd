import { EventsHandler, type IEventHandler } from "@nestjs/cqrs";

import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { ProductionDayClosedEvent } from "../../../../production/channels/commerce/index.js";
import { OrderRepository } from "../../domain/ports/order.repository.js";

/**
 * **Le commerce apprend qu'une journée est partie en fabrication.**
 *
 * ## Pourquoi l'abonné vit ICI
 *
 * `confirmed` est un fait du commerce : c'est son énuméré, sa table, sa règle.
 * La production ne l'écrit pas — elle publie que la journée est arrêtée, et le
 * commerce en tire ce qui le concerne. Chaque contexte n'écrit QUE ses tables,
 * et c'est ce qui rend le couplage minimal : la production ne connaît pas cet
 * abonné, ne l'attend pas, et ne saurait pas dire s'il a réussi.
 *
 * ## Ce que ce couplage coûte, et comment on le rattrape
 *
 * ⚠️ Le bus vit **en processus** : l'événement n'est ni persisté ni rejoué. Un
 * container qui tombe entre la publication et l'écriture — ou un `absorbIntoPlan`
 * qui échoue — laisse des commandes `placed` sur une journée close.
 *
 * Deux choses le rendent rattrapable plutôt que perdu :
 *
 * 1. **L'écriture est idempotente** — `status: placed` dans le `where`. La
 *    rejouer ne fait rien de plus.
 * 2. **La clôture est rejouable** — presser à nouveau le bouton republie le fait
 *    sans recalculer l'instantané.
 *
 * Ce qu'on n'a PAS : une file, un outbox, un rejeu automatique. Ce serait la
 * vraie réponse à « l'événement ne doit jamais se perdre », et c'est un chantier
 * en soi. Le dire ici évite qu'on croie l'avoir.
 *
 * `BackgroundWork.track` est obligatoire — `lint:events-tracked` le vérifie. Un
 * `void promesse` mourrait en silence, ce qui est exactement arrivé au journal
 * des envois avant qu'on ne le corrige.
 */
@EventsHandler(ProductionDayClosedEvent)
export class OnProductionDayClosed implements IEventHandler<ProductionDayClosedEvent> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly work: BackgroundWork,
  ) {}

  handle(event: ProductionDayClosedEvent): void {
    void this.work.track(this.run(event), "on-production-day-closed");
  }

  private async run(event: ProductionDayClosedEvent): Promise<void> {
    // L'instant du SNAPSHOT, pas celui de la réception : deux commandes
    // absorbées par la même clôture doivent porter la même heure, y compris
    // quand l'abonné tourne une seconde plus tard ou lors d'une réannonce.
    await this.orders.absorbIntoPlan(event.serviceDay, event.closedAt);
  }
}
