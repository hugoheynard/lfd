import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class SetProductCustomRecipeCommand {
  constructor(
    readonly id: string,
    /** `true` = recette sur mesure ; `false` = fiche ouverte à sa clientèle. */
    readonly customRecipe: boolean,
  ) {}
}

/**
 * **Déclare la fiche sur mesure** — ou la rend ouverte
 * (`documentation/catalogue/plan-articles-sur-mesure.md` § 13, D1).
 *
 * Le référentiel pose le FAIT ; à quels comptes l'article est attribué reste
 * au commerce (D2). Cochée et sans compte attribué, la fiche n'est servie à
 * aucun pro au fait suivant (D3, D4) : l'émission part dans la même unité de
 * travail que l'écriture, comme pour le froid.
 *
 * Journalisé comme les opérations : un fait quand quelque chose a changé, un
 * motif `untraced` sinon.
 */
@CommandHandler(SetProductCustomRecipeCommand)
export class SetProductCustomRecipeHandler implements ICommandHandler<
  SetProductCustomRecipeCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetProductCustomRecipeCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    const changed = product.declareCustomRecipe(command.customRecipe);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, changed);
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([command.id]);
    });
  }

  private async journalize(product: Product, changed: boolean): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("sur mesure inchangé");
    }
    return this.journal.trace({
      type: PIM_EVENTS.productCustomRecipeChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: product.snapshot().name.fr,
        from: !product.customRecipe,
        to: product.customRecipe,
      },
    });
  }
}
