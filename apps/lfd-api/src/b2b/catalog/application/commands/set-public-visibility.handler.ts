import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import {
  CatalogItemHiddenPublicEvent,
  CatalogItemShownPublicEvent,
} from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { SetPublicVisibilityCommand } from "./set-public-visibility.command.js";

/**
 * Masque un article de la vitrine publique ou l'y remet. Masquer un article
 * déjà masqué n'écrit pas de fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * décisions de catalogue : `catalog-decision-support.ts`.
 */
@CommandHandler(SetPublicVisibilityCommand)
export class SetPublicVisibilityHandler implements ICommandHandler<
  SetPublicVisibilityCommand,
  void
> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPublicVisibilityCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const wasHidden = item.isHiddenPublic;
      if (command.hidden) {
        item.hidePublic(command.decidedBy);
      } else {
        item.showPublic(command.decidedBy);
      }
      await this.items.saveMany([item]);
      if (item.isHiddenPublic !== wasHidden) {
        await this.events.publishTraced(
          item.isHiddenPublic
            ? new CatalogItemHiddenPublicEvent(subjectOf(item))
            : new CatalogItemShownPublicEvent(subjectOf(item)),
        );
      }
    });
  }
}
