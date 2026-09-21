import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { CatalogItemPublicPriceSetEvent } from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import { PUBLIC_SALES_CONTEXT } from "../../domain/public-context.js";
import { loadOrFail, subjectOf } from "./catalog-decision-support.js";
import { SetPublicPriceCommand } from "./set-public-price.command.js";

/**
 * Pose le prix public d'un article. Reposer le prix déjà posé n'écrit pas de
 * fait.
 *
 * Le cycle, la journalisation et la règle du geste sans effet sont ceux des
 * décisions de catalogue : `catalog-decision-support.ts`.
 *
 * Le **contexte** vient du domaine et non de la commande : c'est une règle de
 * vente (« la boutique publique expose à emporter »), pas un paramètre que
 * l'appelant choisit. Le jour où elle devient une fonction du mode de service,
 * c'est ici qu'elle se résoudra — pas dans une route.
 */
@CommandHandler(SetPublicPriceCommand)
export class SetPublicPriceHandler implements ICommandHandler<SetPublicPriceCommand, void> {
  constructor(
    private readonly items: CatalogItemRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetPublicPriceCommand): Promise<void> {
    await this.uow.run(async () => {
      const item = await loadOrFail(this.items, command.sku);
      const before = item.decidedPublicTtcCents;
      item.setPublicPrice(command.ttcCents, PUBLIC_SALES_CONTEXT, command.decidedBy);
      await this.items.saveMany([item]);
      if (before !== command.ttcCents) {
        await this.events.publishTraced(
          new CatalogItemPublicPriceSetEvent(subjectOf(item), before, command.ttcCents),
        );
      }
    });
  }
}
