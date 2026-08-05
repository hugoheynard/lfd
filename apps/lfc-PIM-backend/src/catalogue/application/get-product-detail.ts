import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { EditorialReader } from '../domain/ports/editorial-reader.js';
import type { ProductEditorialView } from '../domain/ports/editorial-reader.js';
import {
  ProductRepository,
  type ProductRecord,
} from '../domain/ports/product.repository.js';

/** Détail complet d'un produit : le socle + sa couche éditoriale (pour l'édition). */
export type ProductDetail = ProductRecord & {
  readonly editorial: ProductEditorialView | null;
};

export class GetProductDetailQuery {
  constructor(readonly id: string) {}
}

@QueryHandler(GetProductDetailQuery)
export class GetProductDetailHandler implements IQueryHandler<
  GetProductDetailQuery,
  ProductDetail | null
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly editorials: EditorialReader,
  ) {}

  async execute(query: GetProductDetailQuery): Promise<ProductDetail | null> {
    const product = await this.products.findById(query.id);
    if (product === null) {
      return null;
    }
    const editorial = await this.editorials.findByProduct(query.id);
    return { ...product, editorial };
  }
}
