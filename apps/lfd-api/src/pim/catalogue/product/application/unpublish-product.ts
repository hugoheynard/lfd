import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
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
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: UnpublishProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    // Un produit déjà en brouillon n'est pas retiré de la vente : il n'y était
    // pas. Le fait était pourtant tracé inconditionnellement, avec sa portée —
    // « N articles cessent d'être vendus » sur une fiche qui n'a pas bougé
    // (audit 2026-09-01).
    if (!product.unpublish()) {
      return;
    }
    const { sku, name, variants } = product.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productUnpublished,
        subjectType: "product",
        subjectId: command.id,
        payload: { sku, name },
        // La portée d'un retrait : les articles qui cessent d'être vendus.
        blast: { variants: variants.length },
      });
      await this.products.save(product, ticket);
    });
  }
}
