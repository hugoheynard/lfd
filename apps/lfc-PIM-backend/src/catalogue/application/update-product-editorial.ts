import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { EditorialRepository } from '../domain/ports/editorial.repository.js';
import { ProductRepository } from '../domain/ports/product.repository.js';
import {
  editorial,
  type EditorialInput,
} from '../domain/value-objects/editorial.js';
import { requireProduct } from './product-support.js';

export class UpdateProductEditorialCommand {
  constructor(
    readonly id: string,
    readonly input: EditorialInput,
  ) {}
}

/**
 * Met à jour la couche éditoriale (texte). Les médias suivent leur propre cycle
 * (doc 01) et ne sont **pas** touchés ici — d'où la liste vide passée à `save`.
 */
@CommandHandler(UpdateProductEditorialCommand)
export class UpdateProductEditorialHandler implements ICommandHandler<
  UpdateProductEditorialCommand,
  void
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly editorials: EditorialRepository,
  ) {}

  async execute(command: UpdateProductEditorialCommand): Promise<void> {
    await requireProduct(this.products, command.id);
    await this.editorials.save(command.id, editorial(command.input), []);
  }
}
