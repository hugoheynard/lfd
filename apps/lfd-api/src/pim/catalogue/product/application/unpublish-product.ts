import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class UnpublishProductCommand {
  constructor(readonly id: string) {}
}

/**
 * Retire le produit de la vente en ligne — il redevient brouillon, il n'est
 * pas archivé. Les deux gestes sont distincts : dépublier est un retrait
 * temporaire, archiver est une sortie de catalogue.
 */
@CommandHandler(UnpublishProductCommand)
export class UnpublishProductHandler implements ICommandHandler<UnpublishProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
  ) {}

  async execute(command: UnpublishProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    product.unpublish();
    await this.products.save(product);
    const { sku, name, variants } = product.snapshot();
    await this.journal.record({
      type: PIM_EVENTS.productUnpublished,
      subjectType: "product",
      subjectId: command.id,
      payload: { sku, name },
      // La portée d'un retrait : les articles qui cessent d'être vendus.
      blast: { variants: variants.length },
    });
  }
}
