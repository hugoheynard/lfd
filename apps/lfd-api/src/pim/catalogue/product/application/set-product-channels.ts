import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { requireCategory } from "../../category/application/category-support.js";
import { CategoryUnknownEmplacementError } from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { KnownEmplacementsReader } from "../../category/domain/ports/known-emplacements.reader.js";
import { SalesContextRegistry } from "../../shared/domain/ports/sales-context.registry.js";
import {
  referencedEmplacements,
  type SalesChannels,
} from "../../shared/domain/value-objects/sales-channels.js";
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
    private readonly emplacements: KnownEmplacementsReader,
    private readonly contexts: SalesContextRegistry,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: SetProductChannelsCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    if (command.channels !== null) {
      await this.refuseUnknownEmplacements(command.channels);
    }
    const category = await requireCategory(this.categories, product.categoryId);

    const before = product.channelOverride;
    product.setChannels(command.channels, await this.contexts.active(), category.channelPreset);
    await this.products.save(product);
    await this.journalize(product.id, before, product.channelOverride);
  }

  /**
   * La grille est indexée par identifiant d'emplacement dans une colonne
   * `jsonb` : aucune clé étrangère ne tient cette référence. Un emplacement
   * fantôme serait accepté, persisté, puis rendu INVISIBLE par l'écran — qui
   * ignore les clés inconnues. Le mur existe déjà pour les familles ; une fiche
   * qui déroge doit rencontrer le même.
   */
  private async refuseUnknownEmplacements(channels: SalesChannels): Promise<void> {
    const cited = referencedEmplacements(channels);
    const known = await this.emplacements.existing(cited);
    for (const id of cited) {
      if (!known.has(id)) {
        throw new CategoryUnknownEmplacementError(id);
      }
    }
  }

  /**
   * Ce qui se relit six mois après : « depuis quand cette fiche ne se vend plus
   * au comptoir ». Silencieux quand rien n'a bougé.
   */
  private async journalize(
    productId: string,
    before: SalesChannels | null,
    after: SalesChannels | null,
  ): Promise<void> {
    if (JSON.stringify(before) === JSON.stringify(after)) {
      return;
    }
    await this.journal.record({
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
