import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";
import { CatalogEmitter } from "../../shared/domain/ports/catalog-emitter.js";

export class DeleteProductCommand {
  constructor(readonly id: string) {}
}

/**
 * **Supprime** une fiche archivée — un soft delete (`deleted`), jamais un
 * `DELETE` : la ligne reste, le SKU reste pris au registre
 * (`documentation/pim/plan-effacer-une-fiche-archivee.md`, v4).
 *
 * L'émission part quand même : le fait porte `archived` au commerce
 * (`STATUS_OF.deleted`), et le miroir, qui l'a déjà retirée à l'archivage,
 * n'a pas à connaître la différence.
 */
@CommandHandler(DeleteProductCommand)
export class DeleteProductHandler implements ICommandHandler<DeleteProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
    private readonly emitter: CatalogEmitter,
  ) {}

  async execute(command: DeleteProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    // Refuse hors archivée, avant toute écriture : rien ne se journalise.
    product.delete();
    const { sku, name } = product.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productDeleted,
        subjectType: "product",
        subjectId: command.id,
        // Le SKU et le nom voyagent avec le fait : c'est par lui seul qu'on
        // retrouve une fiche que plus aucun écran ne montre.
        payload: { subjectLabel: name.fr, sku, name },
      });
      await this.products.save(product, ticket);
      await this.emitter.emitProducts([command.id]);
    });
  }
}
