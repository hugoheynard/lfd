import { PimJournal } from "../../../journal/pim-journal.js";
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
  ) {}

  async execute(command: RestoreProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    product.restore();
    // Dette déclarée (cf. `lint:journal-tracked`) : l'restauration d'une fiche
    // n'a pas encore de fait nommé. Le motif est ici, greppable, plutôt
    // que dans un silence qu'on prendrait pour une décision.
    await this.products.save(
      product,
      this.journal.untraced(
        "restauration de fiche — aucun événement métier défini (dette journal-tracked)",
      ),
    );
  }
}
