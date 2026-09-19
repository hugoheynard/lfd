import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CatalogItemB2bPriceSetEvent } from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { SetB2bPriceCommand } from "./set-b2b-price.command.js";

/**
 * Pose le prix B2B d'un article. Reposer le prix déjà posé n'écrit pas de fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * quatre décisions de catalogue : `catalog-decision-support.ts`.
 */
@CommandHandler(SetB2bPriceCommand)
export class SetB2bPriceHandler implements ICommandHandler<SetB2bPriceCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetB2bPriceCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const before = item.b2bPriceMillicents;
      item.setB2bPrice(command.priceMillicents, command.decidedBy);
      await this.items.saveMany([item]);
      if (before !== command.priceMillicents) {
        await this.events.publishTraced(
          new CatalogItemB2bPriceSetEvent(subjectOf(item), before, command.priceMillicents),
        );
      }
    });
  }
}
