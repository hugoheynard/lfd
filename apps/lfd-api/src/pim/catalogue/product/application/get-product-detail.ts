import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { EditorialReader } from "../domain/ports/editorial-reader.js";
import type { ProductEditorialView, ProductMediaRecord } from "../domain/ports/editorial-reader.js";
import { ProductRepository, type ProductRecord } from "../domain/ports/product.repository.js";

/** Détail complet : le socle, sa couche éditoriale et ses visuels. */
export type ProductDetail = ProductRecord & {
  readonly editorial: ProductEditorialView | null;
  readonly media: readonly ProductMediaRecord[];
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
    const [editorial, media] = await Promise.all([
      this.editorials.findByProduct(query.id),
      this.editorials.mediaOf(query.id),
    ]);
    return { ...product.snapshot(), editorial, media };
  }
}
