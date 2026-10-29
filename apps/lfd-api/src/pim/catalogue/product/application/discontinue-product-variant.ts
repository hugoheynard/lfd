import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct, variantSnapshotOf } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class DiscontinueProductVariantCommand {
  constructor(
    readonly productId: string,
    readonly variantId: string,
  ) {}
}

/**
 * **Archive une déclinaison** (`plan-gestes-de-declinaison.md`, G1).
 *
 * Les refus sont ceux de l'agrégat (le défaut, la dernière vivante, déjà
 * archivée). L'émission au catalogue fait le reste : les faits du produit
 * n'en portent plus l'article, et le commerce retire de la vente tout article
 * de la fiche absent des faits (`withdrawOthers`, vérifié le 2026-10-29).
 */
@CommandHandler(DiscontinueProductVariantCommand)
export class DiscontinueProductVariantHandler implements ICommandHandler<
  DiscontinueProductVariantCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: DiscontinueProductVariantCommand): Promise<void> {
    const { productId, variantId } = command;
    const product = await requireProduct(this.products, productId);
    product.discontinueVariant(variantId);
    const snapshot = product.snapshot();
    const variant = variantSnapshotOf(snapshot, variantId);

    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productVariantDiscontinued,
        subjectType: "product",
        subjectId: productId,
        payload: {
          subjectLabel: snapshot.name.fr,
          variant: { id: variantId, name: variant.name.fr },
          sku: variant.sku,
        },
      });
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([productId]);
    });
  }
}
