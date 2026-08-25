import { PimJournal } from "../../../journal/pim-journal.js";
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
  ) {}

  async execute(command: ArchiveProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    product.archive();
    // Dette déclarée (cf. `lint:journal-tracked`) : l'archivage d'une fiche
    // n'a pas encore de fait nommé. Le motif est ici, greppable, plutôt
    // que dans un silence qu'on prendrait pour une décision.
    await this.products.save(
      product,
      this.journal.untraced(
        "archivage de fiche — aucun événement métier défini (dette journal-tracked)",
      ),
    );
  }
}
