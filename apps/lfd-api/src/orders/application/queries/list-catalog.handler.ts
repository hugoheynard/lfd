import type { CatalogItemView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { ListCatalogQuery } from "./list-catalog.query.js";

/**
 * Rend le catalogue. Une projection sans logique : le port a déjà rangé et
 * trié — ici on ne fait que refuser de laisser fuir un champ interne.
 */
@QueryHandler(ListCatalogQuery)
export class ListCatalogHandler implements IQueryHandler<
  ListCatalogQuery,
  readonly CatalogItemView[]
> {
  constructor(private readonly catalog: ProductCatalogReader) {}

  async execute(): Promise<readonly CatalogItemView[]> {
    const items = await this.catalog.all();
    return items.map((item) => ({
      sku: item.sku,
      name: item.name,
      unitPriceCents: item.unitPriceCents,
      vatRate: item.vatRate,
      category: item.category,
    }));
  }
}
