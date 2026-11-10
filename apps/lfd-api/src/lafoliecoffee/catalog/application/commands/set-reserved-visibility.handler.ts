import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ReservedVisibilitySetEvent } from "../../domain/events/made-to-order.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { MadeToOrderSettings } from "../../domain/ports/made-to-order-settings.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { SetReservedVisibilityCommand } from "./set-reserved-visibility.command.js";

/**
 * Règle la visibilité d'un article réservé. Permis sur un article sans
 * réservation : le réglage se prépare avant de réserver, et ne joue qu'avec
 * elle. Un geste sans effet n'écrit pas de fait.
 *
 * @throws {CatalogItemNotFoundError} le SKU n'est plus au catalogue.
 */
@CommandHandler(SetReservedVisibilityCommand)
export class SetReservedVisibilityHandler implements ICommandHandler<
  SetReservedVisibilityCommand,
  void
> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly settings: MadeToOrderSettings,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetReservedVisibilityCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const changed = await this.settings.setReservedVisibility(
        command.sku,
        command.visibility,
        this.clock.now(),
      );
      if (changed) {
        await this.events.publishTraced(
          new ReservedVisibilitySetEvent(subjectOf(item), command.visibility),
        );
      }
    });
  }
}
