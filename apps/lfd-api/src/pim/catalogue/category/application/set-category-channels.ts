import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { changesBetween } from "../../../journal/changes.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { PointOfSaleOfferReader } from "../../shared/domain/ports/point-of-sale-offer.reader.js";
import { refuseUnsellableChannels } from "../../shared/application/sellable-channels.js";
import { SalesContextRegistry } from "../../shared/domain/ports/sales-context.registry.js";
import type { SalesChannels } from "../../shared/domain/value-objects/sales-channels.js";
import { requireCategory } from "./category-support.js";

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
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetCategoryChannelsCommand): Promise<void> {
    const category = await requireCategory(this.categories, command.id);
    await refuseUnsellableChannels(command.channels, this.offers);
    const before = category.channelPreset;
    // Le registre décide quels taux tombent avec le canal qu'on ferme : c'est
    // lui qui sait quel contexte s'appuie sur quel canal.
    category.setChannels(command.channels, await this.contexts.active());
    const changes = changesBetween({ channels: before }, { channels: category.channelPreset });
    await this.uow.run(async () => {
      // Régler une grille sur elle-même n'affirme rien — et l'écran renvoie la
      // grille entière à chaque enregistrement, y compris inchangée.
      const ticket =
        Object.keys(changes).length > 0
          ? await this.journal.trace({
              type: PIM_EVENTS.productCategoryChannelsChanged,
              subjectType: "product_category",
              subjectId: category.id,
              payload: { changes },
            })
          : this.journal.untraced("canaux de famille enregistrés sans modification");
      await this.categories.save(category, ticket);
    });
  }
}
