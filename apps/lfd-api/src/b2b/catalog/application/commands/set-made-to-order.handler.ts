import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MadeToOrderChangedEvent } from "../../domain/events/made-to-order.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { MadeToOrderSettings } from "../../domain/ports/made-to-order-settings.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { SetMadeToOrderCommand } from "./set-made-to-order.command.js";

/**
 * Marque ou démarque un article sur mesure. Un geste sans effet n'écrit pas
 * de fait ; le fait part dans l'unité de travail de l'écriture, comme pour le
 * masquage (`catalog-decision-support.ts`).
 *
 * @throws {CatalogItemNotFoundError} le SKU n'est plus au catalogue.
 */
@CommandHandler(SetMadeToOrderCommand)
export class SetMadeToOrderHandler implements ICommandHandler<SetMadeToOrderCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly settings: MadeToOrderSettings,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetMadeToOrderCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const changed = await this.settings.setMadeToOrder(
        command.sku,
        command.madeToOrder,
        this.clock.now(),
      );
      if (changed) {
        await this.events.publishTraced(
          new MadeToOrderChangedEvent(subjectOf(item), command.madeToOrder),
        );
      }
    });
  }
}
