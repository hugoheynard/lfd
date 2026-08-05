import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  ProductRepository,
  type ProductRecord,
} from '../domain/ports/product.repository.js';

/** Lecture du catalogue produit — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListProductsQuery {}

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<
  ListProductsQuery,
  ProductRecord[]
> {
  constructor(private readonly products: ProductRepository) {}

  execute(): Promise<ProductRecord[]> {
    return this.products.listAll();
  }
}
