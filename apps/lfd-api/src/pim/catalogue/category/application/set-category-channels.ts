import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { changesBetween } from "../../../../platform/journal/changes.js";
import { PointOfSaleReader } from "../../../points-of-sale/domain/ports/point-of-sale.reader.js";
import { channelNamer } from "../../shared/application/journal-names.js";
import type { Category } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { PointOfSaleOfferReader } from "../../shared/domain/ports/point-of-sale-offer.reader.js";
import { refuseUnsellableChannels } from "../../shared/application/sellable-channels.js";
import { SalesContextRegistry } from "../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { SalesChannels } from "../../shared/domain/value-objects/sales-channels.js";
import { requireCategory } from "./category-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import { CatalogReemission } from "../../shared/domain/ports/catalog-reemission.js";

export class SetCategoryChannelsCommand {
  constructor(
    readonly id: string,
    readonly channels: SalesChannels,
  ) {}
}

/**
 * Règle où une famille se vend — et **refuse ce qui ne peut pas se vendre**.
 *
 * Deux refus, pas un seul : un point de vente qui n'existe pas (le mur inverse
 * existait déjà — on ne supprime pas un point de vente encore vendu — mais rien
 * ne gardait ce sens-ci), et un contexte que ce point de vente n'offre pas.
 * Vendre « sur place » depuis une boutique sans salle produisait une fiche pour
 * un lieu qui ne sert pas.
 */
@CommandHandler(SetCategoryChannelsCommand)
export class SetCategoryChannelsHandler implements ICommandHandler<
  SetCategoryChannelsCommand,
  void
> {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly offers: PointOfSaleOfferReader,
    private readonly contexts: SalesContextRegistry,
    private readonly points: PointOfSaleReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
    private readonly reemission: CatalogReemission,
  ) {}

  async execute(command: SetCategoryChannelsCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    await refuseUnsellableChannels(command.channels, this.offers);
    const before = category.channelPreset;
    category.setChannels(command.channels);
    await this.uow.run(async () => {
      const ticket =
        (await this.journalizeChannels(category, before)) ??
        this.journal.untraced("canaux de famille enregistrés sans modification");
      await this.categories.save(category, ticket);
      await this.emitter.emitCategories([command.id]);
    });
    await this.reemission.productsOfCategories([command.id]);
  }

  /**
   * Les canaux, NOMMÉS (D5 du plan des phrases) — `null` quand rien n'a bougé.
   *
   * Le diff se calcule sur les identifiants : régler une grille sur elle-même
   * n'affirme rien, et l'écran renvoie la grille entière à chaque
   * enregistrement, y compris inchangée. Les noms ne viennent qu'après, pour
   * la charge.
   */
  private async journalizeChannels(
    category: Category,
    before: SalesChannels,
  ): Promise<WriteTicket | null> {
    const changes = changesBetween({ channels: before }, { channels: category.channelPreset });
    if (Object.keys(changes).length === 0) {
      return null;
    }
    const name = await channelNamer(this.points, this.contexts);
    return this.journal.trace({
      type: PIM_EVENTS.productCategoryChannelsChanged,
      subjectType: "product_category",
      subjectId: category.id,
      payload: {
        subjectLabel: category.name.fr,
        changes: { channels: { from: name(before), to: name(category.channelPreset) } },
      },
    });
  }
}
