import { Injectable } from "@nestjs/common";

import { ProductRepository, type ProductRecord } from "../domain/ports/product.repository.js";
import { ProductRecordsReader } from "../domain/ports/product-records.reader.js";

/**
 * L'adaptateur, **par le dépôt** : la fiche se relit par le mapper qui l'écrit,
 * déclinaisons alignées résolues comprises (`snapshot()`), et le dépôt suit la
 * transaction ambiante.
 */
@Injectable()
export class RepositoryProductRecordsReader extends ProductRecordsReader {
  constructor(private readonly products: ProductRepository) {
    super();
  }

  async byIds(ids: readonly string[]): Promise<ProductRecord[]> {
    const found: ProductRecord[] = [];
    for (const id of ids) {
      const product = await this.products.findById(id);
      if (product !== null) {
        found.push(product.snapshot());
      }
    }
    return found;
  }
}
