import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

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
  constructor(private readonly products: ProductRepository) {}

  async execute(command: PublishProductCommand): Promise<void> {
    const product = await requireProduct(this.products, command.id);
    product.publish();
    await this.products.save(product);
  }
}
