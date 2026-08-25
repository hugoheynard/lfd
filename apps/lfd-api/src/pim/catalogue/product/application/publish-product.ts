import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class PublishProductCommand {
  constructor(readonly id: string) {}
}

/**
 * Met le produit en vente. Le refus — fiche réglementaire manquante, produit
 * archivé — appartient à l'agrégat : il est le seul à voir ses déclinaisons
 * et l'état de leurs fiches.
 */
@CommandHandler(PublishProductCommand)
export class PublishProductHandler implements ICommandHandler<PublishProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: PublishProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    product.publish();
    const { sku, name, variants } = product.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productPublished,
        subjectType: "product",
        subjectId: command.id,
        payload: { sku, name },
        // La portée d'une mise en vente : les articles qui partent avec.
        blast: { variants: variants.length },
      });
      await this.products.save(product, ticket);
    });
  }
}
