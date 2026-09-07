import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { OrderPackedEvent } from "../../channels/commerce/order-packed.event.js";
import { OrderAlreadyPackedError } from "../../domain/errors/production-errors.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { PackOrderCommand } from "./pack-order.command.js";

/**
 * **Le colisage** — le fournil ferme le bac et le déclare.
 *
 * ## Le partage entre l'agrégat et la base
 *
 * L'agrégat porte la RÈGLE : journée arrêtée, référence connue, bac pas déjà
 * fait. Elle est évaluée sur l'état lu, et refuse **avant** toute écriture.
 *
 * La base tranche la COURSE : `packed_at IS NULL` dans le `where`. Deux postes
 * qui scannent la même feuille au même moment produisent exactement un colisage
 * — et c'est le cas normal au fournil, pas une anomalie.
 *
 * C'est exactement le partage de `ConfirmHandoverHandler` côté commerce. Une
 * `load` → `save` de l'agrégat réécrirait la journée entière, et le second
 * scan effacerait le premier.
 *
 * ## Ce qu'il n'écrit PAS
 *
 * Rien chez le commerce. `ready` est le fait du commerce — « prête pour le
 * client » —, tiré du nôtre par un abonné qui vit chez lui.
 */
@CommandHandler(PackOrderCommand)
export class PackOrderHandler implements ICommandHandler<PackOrderCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
  ) {}

  async execute(command: PackOrderCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    const current = await this.days.load(day);
    const at = this.clock.now();

    // Lève si la journée n'est pas arrêtée, si la référence est inconnue, ou si
    // le bac est déjà fait. La mutation en mémoire ne sert qu'à faire jouer les
    // invariants : c'est l'écriture conditionnée qui fait foi.
    current.pack(command.reference, at, command.staffSubject);

    const won = await this.days.markPacked(day, command.reference, at, command.staffSubject);
    if (!won) {
      // Course perdue entre la lecture et l'écriture. On ne réécrit rien : le
      // colisage de l'autre poste est le seul vrai.
      throw new OrderAlreadyPackedError(command.reference);
    }

    this.events.publish(new OrderPackedEvent(command.reference, at, command.staffSubject));
  }
}
