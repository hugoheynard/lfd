import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class RestoreProductCommand {
  constructor(readonly id: string) {}
}

/** Remet un produit archivé en brouillon (`draft`) — jamais directement en ligne. */
@CommandHandler(RestoreProductCommand)
export class RestoreProductHandler implements ICommandHandler<RestoreProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RestoreProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    product.restore();
    const { sku, name } = product.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productRestored,
        subjectType: "product",
        subjectId: command.id,
        // Le SKU et le nom voyagent avec le fait : une fiche archivée sort des
        // écrans, et l'historique ne doit pas se réduire à un identifiant qu'on
        // ne peut plus résoudre nulle part.
        payload: { sku, name },
      });
      await this.products.save(product, ticket);
    });
  }
}
