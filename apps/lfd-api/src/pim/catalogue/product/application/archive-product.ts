import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { PIM_EVENTS, PimJournal } from "../../../journal/pim-journal.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class ArchiveProductCommand {
  constructor(readonly id: string) {}
}

/** Retire le produit de la vente (statut `archived`) sans le supprimer. */
@CommandHandler(ArchiveProductCommand)
export class ArchiveProductHandler implements ICommandHandler<ArchiveProductCommand, void> {
  constructor(
    private readonly products: ProductRepository,
    private readonly journal: PimJournal,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ArchiveProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    // Rien à écrire, donc rien à journaliser : l'archivage est idempotent (une
    // sélection en lot contient couramment ce qui l'est déjà), et un fait
    // `product.archived` de plus affirmerait une sortie de catalogue qui n'a
    // pas eu lieu.
    if (!product.archive()) {
      return;
    }
    const { sku, name } = product.snapshot();
    await this.uow.run(async () => {
      const ticket = await this.journal.trace({
        type: PIM_EVENTS.productArchived,
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
