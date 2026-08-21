import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { ProductRepository } from "../domain/ports/product.repository.js";
import { requireProduct } from "./product-support.js";

export class ArchiveProductCommand {
  constructor(readonly id: string) {}
}

/** Retire le produit de la vente (statut `archived`) sans le supprimer. */
@CommandHandler(ArchiveProductCommand)
export class ArchiveProductHandler implements ICommandHandler<ArchiveProductCommand, void> {
  constructor(private readonly products: ProductRepository) {}

  async execute(command: ArchiveProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    product.archive();
    await this.products.save(product);
  }
}
