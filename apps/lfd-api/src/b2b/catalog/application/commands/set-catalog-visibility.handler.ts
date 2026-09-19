import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CatalogItemHiddenEvent,
  CatalogItemShownEvent,
} from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { loadOrFail } from "./catalog-decision-support.js";
import { SetCatalogVisibilityCommand } from "./set-catalog-visibility.command.js";

/**
 * Masque un article ou le remet en vente. Masquer un article déjà masqué
 * n'écrit pas de fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * quatre décisions de catalogue : `catalog-decision-support.ts`.
 */
@CommandHandler(SetCatalogVisibilityCommand)
export class SetCatalogVisibilityHandler implements ICommandHandler<
  SetCatalogVisibilityCommand,
  void
> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetCatalogVisibilityCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const wasHidden = item.isHidden;
      if (command.hidden) {
        item.hide(command.decidedBy);
      } else {
        item.show(command.decidedBy);
      }
      await this.items.saveMany([item]);
      if (item.isHidden !== wasHidden) {
        await this.events.publishTraced(
          item.isHidden
            ? new CatalogItemHiddenEvent(item.sku)
            : new CatalogItemShownEvent(item.sku),
        );
      }
    });
  }
}
