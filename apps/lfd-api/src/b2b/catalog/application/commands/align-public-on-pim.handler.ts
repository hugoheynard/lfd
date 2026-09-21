import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CatalogItemPublicPriceClearedEvent } from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { AlignPublicOnPimCommand } from "./align-public-on-pim.command.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";

/**
 * Ramène un article à l'étiquette publique du PIM. Y revenir quand on la suit
 * déjà n'écrit pas de fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * décisions de catalogue : `catalog-decision-support.ts`.
 */
@CommandHandler(AlignPublicOnPimCommand)
export class AlignPublicOnPimHandler implements ICommandHandler<AlignPublicOnPimCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AlignPublicOnPimCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const before = item.decidedPublicTtcCents;
      item.alignPublicOnPim();
      await this.items.saveMany([item]);
      if (before !== null) {
        await this.events.publishTraced(
          new CatalogItemPublicPriceClearedEvent(subjectOf(item), before),
        );
      }
    });
  }
}
