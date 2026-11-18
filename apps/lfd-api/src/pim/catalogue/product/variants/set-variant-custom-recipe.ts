import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { Product } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { namedVariant, requireProduct, variantSnapshotOf } from "../shared/product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class SetVariantCustomRecipeCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
    /** `true` = recette sur mesure ; `false` = déclinaison ouverte à sa clientèle. */
    readonly customRecipe: boolean,
  ) {}
}

/**
 * **Déclare une déclinaison sur mesure** — ou la rend ouverte
 * (`documentation/catalogue/plan-sur-mesure-par-declinaison.md`, V1).
 *
 * Le référentiel pose le FAIT ; à quels comptes l'article est attribué reste
 * au commerce. Cochée et sans compte attribué, la déclinaison n'est servie à
 * aucun pro au fait suivant (D3) : l'émission part dans la même unité de
 * travail que l'écriture. Le refus du défaut d'une fiche sans vignettes (V5)
 * est celui de l'agrégat, avant toute écriture.
 *
 * Journalisé comme les opérations : un fait quand quelque chose a changé, un
 * motif `untraced` sinon.
 */
@CommandHandler(SetVariantCustomRecipeCommand)
export class SetVariantCustomRecipeHandler implements ICommandHandler<
  SetVariantCustomRecipeCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: SetVariantCustomRecipeCommand): Promise<void> {
    const { productId, variantId, customRecipe } = command;
    const product = await requireProduct(this.products, productId);
    const changed = product.declareVariantCustomRecipe(variantId, customRecipe);
    await this.uow.run(async () => {
      const ticket = await this.journalize(product, variantId, changed);
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }

  private async journalize(
    product: Product,
    variantId: string,
    changed: boolean,
  ): Promise<WriteTicket> {
    if (!changed) {
      return this.journal.untraced("sur mesure de la déclinaison inchangé");
    }
    const snapshot = product.snapshot();
    const after = variantSnapshotOf(snapshot, variantId).customRecipe ?? false;
    return this.journal.trace({
      type: PIM_EVENTS.variantCustomRecipeChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: snapshot.name.fr,
        variant: namedVariant(snapshot, variantId),
        from: !after,
        to: after,
      },
    });
  }
}
