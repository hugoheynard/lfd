import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import type { CatalogItem } from "../../domain/entities/catalog-item.js";
import { CatalogItemNotFoundError } from "../../domain/errors/catalog-not-found.error.js";
import {
  CatalogItemB2bPriceClearedEvent,
  CatalogItemB2bPriceSetEvent,
  CatalogItemFeaturedEvent,
  CatalogItemHiddenEvent,
  CatalogItemShownEvent,
  CatalogItemUnfeaturedEvent,
} from "../../domain/events/catalog-item.events.js";
import { CatalogItemRepository } from "../../domain/ports/catalog-item.repository.js";
import {
  AlignOnPimPriceCommand,
  SetB2bPriceCommand,
  SetCatalogFeaturedCommand,
  SetCatalogVisibilityCommand,
} from "./catalog-decision.commands.js";

/**
 * Les quatre gestes du back-office sur un article.
 *
 * Chacun fait **une** chose, et toujours le même cycle : charger l'agrégat,
 * appeler une méthode métier, le rendre au port. Aucun handler ne connaît de
 * colonne ; aucun ne décide d'un refus — les refus vivent dans l'agrégat, où le
 * prochain appelant les trouvera aussi.
 *
 * La garde commune (« l'article existe-t-il encore ? ») est extraite plutôt que
 * recopiée quatre fois : un push peut avoir retiré l'article entre l'affichage
 * de la liste et le clic, et c'est un cas qui arrive pour de bon.
 *
 * **Journalisés depuis le 2026-09-19** (plan `journalisation/
 * plan-journal-d-activite.md`, lot 1, tranche (b)) : un fait par geste, écrit
 * dans la même unité de travail que l'article — un journal en panne annule le
 * geste. L'auteur vient du contexte de requête, pas de `decidedBy`.
 *
 * Un geste **sans effet** — masquer un article déjà masqué, revenir au PIM
 * quand on le suit déjà — n'écrit pas de fait : il dirait qu'une décision a
 * changé alors qu'elle n'a pas bougé. L'état d'avant se lit sur l'agrégat, et
 * c'est lui qui a appliqué ou non la règle ; le handler ne fait que comparer.
 */
async function loadOrFail(items: CatalogItemRepository, sku: string): Promise<CatalogItem> {
  const item = await items.load(sku);
  if (item === null) {
    throw new CatalogItemNotFoundError(sku);
  }
  return item;
}

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
          new CatalogItemB2bPriceSetEvent(item.sku, before, command.priceMillicents),
        );
      }
    });
  }
}

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
