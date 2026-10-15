import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CatalogItemHiddenEvent,
  CatalogItemHiddenPublicEvent,
  CatalogItemShownEvent,
  CatalogItemShownPublicEvent,
  type CatalogItemSubject,
} from "../../domain/events/catalog-item.events.js";
import type { JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import type { ShopAudience } from "../../domain/ports/catalog.reader.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { SetMaskingCommand } from "./set-masking.command.js";

type EventOf = (item: CatalogItemSubject) => JournaledEvent;

/**
 * Les faits de journal, par audience et par sens. Les VALEURS de journal
 * d'avant la route unique restent (`catalog_item.hidden`,
 * `catalog_item.hidden_public`…) : une valeur ne se renomme pas, et le
 * journal déjà écrit les cite.
 */
const FACTS: Readonly<Record<ShopAudience, { readonly hidden: EventOf; readonly shown: EventOf }>> =
  {
    pro: {
      hidden: (item) => new CatalogItemHiddenEvent(item),
      shown: (item) => new CatalogItemShownEvent(item),
    },
    public: {
      hidden: (item) => new CatalogItemHiddenPublicEvent(item),
      shown: (item) => new CatalogItemShownPublicEvent(item),
    },
  };

/**
 * Masque un article pour une audience, ou l'y remet. L'agrégat refuse de
 * masquer pour une audience à laquelle le référentiel ne le vend pas ; un
 * geste sans effet n'écrit pas de fait.
 *
 * Le cycle et la journalisation sont ceux des décisions de catalogue :
 * `catalog-decision-support.ts`.
 */
@CommandHandler(SetMaskingCommand)
export class SetMaskingHandler implements ICommandHandler<SetMaskingCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetMaskingCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const wasMasked = item.isMaskedFor(command.audience);
      if (command.hidden) {
        item.mask(command.audience, command.decidedBy);
      } else {
        item.unmask(command.audience, command.decidedBy);
      }
      await this.items.saveMany([item]);
      const masked = item.isMaskedFor(command.audience);
      if (masked !== wasMasked) {
        const facts = FACTS[command.audience];
        await this.events.publishTraced((masked ? facts.hidden : facts.shown)(subjectOf(item)));
      }
    });
  }
}
