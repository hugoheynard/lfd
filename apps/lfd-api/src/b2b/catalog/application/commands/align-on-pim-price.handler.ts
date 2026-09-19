import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CatalogItemB2bPriceClearedEvent } from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { AlignOnPimPriceCommand } from "./align-on-pim-price.command.js";
import { loadOrFail } from "./catalog-decision-support.js";

/**
 * Ramène un article au tarif du PIM. Revenir au PIM quand on le suit déjà
 * n'écrit pas de fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * quatre décisions de catalogue : `catalog-decision-support.ts`.
 */
@CommandHandler(AlignOnPimPriceCommand)
export class AlignOnPimPriceHandler implements ICommandHandler<AlignOnPimPriceCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AlignOnPimPriceCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const before = item.b2bPriceMillicents;
      item.alignOnPim();
      await this.items.saveMany([item]);
      if (before !== null) {
        await this.events.publishTraced(new CatalogItemB2bPriceClearedEvent(item.sku, before));
      }
    });
  }
}
