import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { PointOfSaleOfferReader } from "../../shared/domain/ports/point-of-sale-offer.reader.js";
import { refuseUnsellableChannels } from "../../shared/application/sellable-channels.js";
import { SalesContextRegistry } from "../../../sales-contexts/domain/ports/sales-context.registry.js";
import type { SalesChannels } from "../../shared/domain/value-objects/sales-channels.js";
import { PointOfSaleReader } from "../../../points-of-sale/domain/ports/point-of-sale.reader.js";
import { channelNamer } from "../../shared/application/journal-names.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

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
 * Une vérification que l'agrégat ne peut pas faire seul : l'emplacement cité
 * existe (aucune clé étrangère ne tient cette référence — c'est du `jsonb`).
 * Aucun taux n'est touché : la TVA ne dépend plus des canaux (2026-10-15).
 */
@CommandHandler(SetProductChannelsCommand)
export class SetProductChannelsHandler implements ICommandHandler<SetProductChannelsCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly offers: PointOfSaleOfferReader,
    private readonly contexts: SalesContextRegistry,
    private readonly points: PointOfSaleReader,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetProductChannelsCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    if (command.channels !== null) {
      await refuseUnsellableChannels(command.channels, this.offers);
    }
    const before = product.channelOverride;
    product.setChannels(command.channels);
    await this.uow.run(async () => {
      await this.products.save(product, await this.journalize(product, before));
      await this.emitter.emitProducts([command.id]);
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
}
