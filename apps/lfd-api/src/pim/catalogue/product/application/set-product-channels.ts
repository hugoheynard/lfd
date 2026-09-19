import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal, type WriteTicket } from "../../../journal/pim-journal.js";
import { requireCategory } from "../../category/application/category-support.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { PointOfSaleOfferReader } from "../../shared/domain/ports/point-of-sale-offer.reader.js";
import { refuseUnsellableChannels } from "../../shared/application/sellable-channels.js";
import { SalesContextRegistry } from "../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { SalesChannels } from "../../shared/domain/value-objects/sales-channels.js";
import { erasedVat, type ContextVat } from "../../shared/domain/value-objects/context-vat.js";
import { PointOfSaleReader } from "../../../points-of-sale/domain/ports/point-of-sale.reader.js";
import { VatRateRepository } from "../../../vat-rates/domain/ports/vat-rate.repository.js";
import { channelNamer, namedVatChange } from "../../shared/application/journal-names.js";
import type { Product } from "../domain/entities/product.js";
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
    private readonly points: PointOfSaleReader,
    private readonly rates: VatRateRepository,
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
    const vatBefore = product.vatByContext;
    product.setChannels(command.channels, await this.contexts.active(), category.channelPreset);
    await this.uow.run(async () => {
      const channelsTicket = await this.journalize(product, before);
      const vatTicket = await this.journalizeErasedVat(product, vatBefore);
      await this.products.save(product, vatTicket ?? channelsTicket);
    });
  }

  /**
   * Ce qui se relit six mois après : « depuis quand cette fiche ne se vend plus
   * au comptoir ». Silencieux quand rien n'a bougé.
   */
  private async journalize(product: Product, before: SalesChannels | null): Promise<WriteTicket> {
    const after = product.channelOverride;
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return this.journal.untraced("aucune dérogation de canaux modifiée");
    }
    // Chaque ligne NOMMÉE (D5 du plan des phrases) : le point de vente et le
    // contexte sous le nom qu'ils portaient ce jour-là.
    const name = await channelNamer(this.points, this.contexts);
    return this.journal.trace({
      type: PIM_EVENTS.productChannelsChanged,
      subjectType: "product",
      subjectId: product.id,
      // `inherited` plutôt qu'un `null` nu : à la relecture, « hérité » est une
      // information, « null » est une case vide qu'il faut interpréter.
      payload: {
        subjectLabel: product.snapshot().name.fr,
        from: before === null ? "inherited" : name(before),
        to: after === null ? "inherited" : name(after),
      },
    });
  }

  /**
   * Les dérogations de taux que le geste a effacées, en fait de TVA ordinaire
   * (`product.vat_changed`, `vatByContext: { contexte: { from, to: null } }`, taux nommés) — `null` si
   * aucune n'a disparu.
   *
   * `channels_changed` ne porte que la matrice : sans ce second fait, un taux
   * effacé par une fermeture de canal échappait à la comptabilité, qui relit
   * tout ce qui touche au taux (Hugo, 2026-09-19).
   */
  private async journalizeErasedVat(
    product: Product,
    before: ContextVat,
  ): Promise<WriteTicket | null> {
    const erased = erasedVat(before, product.vatByContext);
    if (Object.keys(erased).length === 0) {
      return null;
    }
    return this.journal.trace({
      type: PIM_EVENTS.productVatChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: product.snapshot().name.fr,
        vatByContext: await namedVatChange(erased, this.rates),
      },
    });
  }
}
