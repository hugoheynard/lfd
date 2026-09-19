import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CatalogItemFeaturedEvent,
  CatalogItemUnfeaturedEvent,
} from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { loadOrFail } from "./catalog-decision-support.js";
import { SetCatalogFeaturedCommand } from "./set-catalog-featured.command.js";

/**
 * Met un article en avant ou l'en retire. Un geste qui ne change rien n'écrit
 * pas de fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * quatre décisions de catalogue : `catalog-decision-support.ts`.
 */
@CommandHandler(SetCatalogFeaturedCommand)
export class SetCatalogFeaturedHandler implements ICommandHandler<SetCatalogFeaturedCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetCatalogFeaturedCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const wasFeatured = item.isFeatured;
      if (command.featured) {
        item.feature(command.decidedBy);
      } else {
        item.unfeature(command.decidedBy);
      }
      await this.items.saveMany([item]);
      if (item.isFeatured !== wasFeatured) {
        await this.events.publishTraced(
          item.isFeatured
            ? new CatalogItemFeaturedEvent(item.sku)
            : new CatalogItemUnfeaturedEvent(item.sku),
        );
      }
    });
  }
}
