import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import {
  CatalogItemFeaturedProEvent,
  CatalogItemFeaturedPublicEvent,
  CatalogItemUnfeaturedProEvent,
  CatalogItemUnfeaturedPublicEvent,
  type CatalogItemSubject,
} from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import type { ShopAudience } from "../../domain/ports/catalog.reader.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { SetCatalogFeaturedCommand } from "./set-catalog-featured.command.js";

type EventOf = (item: CatalogItemSubject) => JournaledEvent;

/** Les faits de journal, par audience et par sens — la forme du masquage. */
const FACTS: Readonly<
  Record<ShopAudience, { readonly featured: EventOf; readonly unfeatured: EventOf }>
> = {
  pro: {
    featured: (item) => new CatalogItemFeaturedProEvent(item),
    unfeatured: (item) => new CatalogItemUnfeaturedProEvent(item),
  },
  public: {
    featured: (item) => new CatalogItemFeaturedPublicEvent(item),
    unfeatured: (item) => new CatalogItemUnfeaturedPublicEvent(item),
  },
};

/**
 * Met un article en avant pour une audience, ou l'en retire. L'agrégat refuse
 * une audience que l'article ne sert pas, ou pour laquelle il est masqué ; un
 * geste qui ne change rien n'écrit pas de fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * décisions de catalogue : `catalog-decision-support.ts`.
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
      const wasFeatured = item.isFeaturedFor(command.audience);
      if (command.featured) {
        item.feature(command.audience, command.decidedBy);
      } else {
        item.unfeature(command.audience, command.decidedBy);
      }
      await this.items.saveMany([item]);
      const featured = item.isFeaturedFor(command.audience);
      if (featured !== wasFeatured) {
        const facts = FACTS[command.audience];
        await this.events.publishTraced(
          (featured ? facts.featured : facts.unfeatured)(subjectOf(item)),
        );
      }
    });
  }
}
