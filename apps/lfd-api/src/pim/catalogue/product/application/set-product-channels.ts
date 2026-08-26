import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal, type WriteTicket } from "../../../journal/pim-journal.js";
import { requireCategory } from "../../category/application/category-support.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { PointOfSaleOfferReader } from "../../shared/domain/ports/point-of-sale-offer.reader.js";
import { refuseUnsellableChannels } from "../../shared/application/sellable-channels.js";
import { SalesContextRegistry } from "../../shared/domain/ports/sales-context.registry.js";
import type { SalesChannels } from "../../shared/domain/value-objects/sales-channels.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class SetProductChannelsCommand {
  constructor(
    readonly id: string,
    /** `null` = la fiche revient à la matrice de sa famille. */
    readonly channels: SalesChannels | null,
  ) {}
}

/**
 * Redéfinit **où une fiche se vend** — ou la rend à sa famille.
 *
 * Tout-ou-rien, à la différence des taux : une matrice à moitié redéfinie ne se
 * lit pas. Devant une case vide, on ne saurait pas dire si la fiche n'est pas
 * vendue là ou si sa famille ne l'y vendait pas.
 *
 * Deux vérifications que l'agrégat ne peut pas faire seul : l'emplacement cité
 * existe (aucune clé étrangère ne tient cette référence — c'est du `jsonb`), et
 * la famille existe, puisque fermer un canal efface les taux que la fiche y
 * avait posés et que l'effacement se juge sur les canaux EFFECTIFS.
 */
@CommandHandler(SetProductChannelsCommand)
export class SetProductChannelsHandler implements ICommandHandler<SetProductChannelsCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly offers: PointOfSaleOfferReader,
    private readonly contexts: SalesContextRegistry,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetProductChannelsCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    if (command.channels !== null) {
      await refuseUnsellableChannels(command.channels, this.offers);
    }
    const category = await requireCategory(this.categories, product.categoryId);

    const before = product.channelOverride;
    product.setChannels(command.channels, await this.contexts.active(), category.channelPreset);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product.id, before, product.channelOverride);
      await this.products.save(product, ticket);
    });
  }

  /**
   * Ce qui se relit six mois après : « depuis quand cette fiche ne se vend plus
   * au comptoir ». Silencieux quand rien n'a bougé.
   */
  private async journalize(
    productId: string,
    before: SalesChannels | null,
    after: SalesChannels | null,
  ): Promise<WriteTicket> {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return this.journal.untraced("aucune dérogation de canaux modifiée");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productChannelsChanged,
      subjectType: "product",
      subjectId: productId,
      // `inherited` plutôt qu'un `null` nu : à la relecture, « hérité » est une
      // information, « null » est une case vide qu'il faut interpréter.
      payload: {
        from: before === null ? "inherited" : before,
        to: after === null ? "inherited" : after,
      },
    });
  }
}
