import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { WriteTicket } from "../../../../platform/journal/scoped-journal.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import type { DefaultVariantChange, Product } from "../domain/entities/product.js";
import { NutritionValuesRepository } from "../domain/ports/nutrition-values.repository.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { VariantAllergensRepository } from "../domain/ports/variant-allergens.repository.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";
import { copiedNutrition } from "./detached-product-copy.js";
import { requireProduct, variantSnapshotOf } from "./product-support.js";

export class MakeVariantDefaultCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
  ) {}
}

/**
 * **Fait d'une déclinaison la déclinaison par défaut** (`plan-gestes-de-declinaison.md`,
 * G4). Les refus et ce qui suit le défaut sont tenus par l'agrégat
 * (`Product.makeVariantDefault`) ; le handler persiste.
 *
 * `save` écrit les deux lignes de déclinaison — `is_default` et les drapeaux
 * d'alignement changent DANS la même ligne, si bien qu'aucune CHECK
 * `*_follows_itself` ne voit un état intermédiaire, et aucun index unique ne
 * porte sur `is_default` (vérifié dans les migrations le 2026-10-29). Les
 * moitiés de fiche réglementaire que la nouvelle reçoit en propre passent par
 * leurs ports dédiés, comme toute déclaration : `save` ne les écrit pas.
 */
@CommandHandler(MakeVariantDefaultCommand)
export class MakeVariantDefaultHandler implements ICommandHandler<MakeVariantDefaultCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly allergenSheets: VariantAllergensRepository,
    private readonly nutritionValues: NutritionValuesRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: MakeVariantDefaultCommand): Promise<void> {
    const { productId, variantId } = command;
    const product = await requireProduct(this.products, productId);
    const change = product.makeVariantDefault(variantId);

    await this.uow.run(async () => {
      const ticket = await this.trace(product, variantId, change.previousDefaultId);
      await this.products.save(product, ticket);
      await this.writeInheritedSheets(product, variantId, change, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }

  private trace(product: Product, variantId: string, previousId: string): Promise<WriteTicket> {
    const snapshot = product.snapshot();
    const variant = variantSnapshotOf(snapshot, variantId);
    const previous = variantSnapshotOf(snapshot, previousId);
    return this.journal.trace({
      type: PIM_EVENTS.productDefaultVariantChanged,
      subjectType: "product",
      subjectId: product.id,
      payload: {
        subjectLabel: snapshot.name.fr,
        variant: { id: variant.id, name: variant.name.fr },
        sku: variant.sku,
        previous: { id: previous.id, name: previous.name.fr },
        previousSku: previous.sku,
      },
    });
  }

  /** Ce qu'elle suivait de la fiche réglementaire, désormais à elle. */
  private async writeInheritedSheets(
    product: Product,
    variantId: string,
    change: DefaultVariantChange,
    ticket: WriteTicket,
  ): Promise<void> {
    const variant = variantSnapshotOf(product.persistenceSnapshot(), variantId);
    if (change.inherited.allergens && variant.allergenSheet !== null) {
      const { declared, mayContain } = variant.allergenSheet;
      await this.allergenSheets.save(variantId, { allergens: declared, mayContain }, ticket);
    }
    if (change.inherited.nutrition && variant.nutrition !== null) {
      await this.nutritionValues.save(variantId, copiedNutrition(variant.nutrition), ticket);
    }
  }
}
