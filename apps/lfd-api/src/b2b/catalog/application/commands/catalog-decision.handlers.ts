import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { CatalogItem } from "../../domain/entities/catalog-item.js";
import { CatalogItemNotFoundError } from "../../domain/errors/catalog-not-found.error.js";
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
  constructor(private readonly items: CatalogItemRepository) {}

  async execute(command: SetB2bPriceCommand): Promise<void> {
    const item = await loadOrFail(this.items, command.sku);
    item.setB2bPrice(command.priceMillicents, command.decidedBy);
    await this.items.saveMany([item]);
  }
}

@CommandHandler(AlignOnPimPriceCommand)
export class AlignOnPimPriceHandler implements ICommandHandler<AlignOnPimPriceCommand, void> {
  constructor(private readonly items: CatalogItemRepository) {}

  async execute(command: AlignOnPimPriceCommand): Promise<void> {
    const item = await loadOrFail(this.items, command.sku);
    item.alignOnPim();
    await this.items.saveMany([item]);
  }
}

@CommandHandler(SetCatalogVisibilityCommand)
export class SetCatalogVisibilityHandler implements ICommandHandler<
  SetCatalogVisibilityCommand,
  void
> {
  constructor(private readonly items: CatalogItemRepository) {}

  async execute(command: SetCatalogVisibilityCommand): Promise<void> {
    const item = await loadOrFail(this.items, command.sku);
    if (command.hidden) {
      item.hide(command.decidedBy);
    } else {
      item.show(command.decidedBy);
    }
    await this.items.saveMany([item]);
  }
}

@CommandHandler(SetCatalogFeaturedCommand)
export class SetCatalogFeaturedHandler implements ICommandHandler<SetCatalogFeaturedCommand, void> {
  constructor(private readonly items: CatalogItemRepository) {}

  async execute(command: SetCatalogFeaturedCommand): Promise<void> {
    const item = await loadOrFail(this.items, command.sku);
    if (command.featured) {
      item.feature(command.decidedBy);
    } else {
      item.unfeature(command.decidedBy);
    }
    await this.items.saveMany([item]);
  }
}
