import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { ProductRepository } from '../domain/ports/product.repository.js';
import { requireProduct } from './product-support.js';

export class RestoreProductCommand {
  constructor(readonly id: string) {}
}

/** Remet un produit archivé en brouillon (`draft`). */
@CommandHandler(RestoreProductCommand)
export class RestoreProductHandler implements ICommandHandler<
  RestoreProductCommand,
  void
> {
  constructor(private readonly products: ProductRepository) {}

  async execute(command: RestoreProductCommand): Promise<void> {
    await requireProduct(this.products, command.id);
    await this.products.setStatus(command.id, 'draft');
  }
}
