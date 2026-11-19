import { Injectable } from "@nestjs/common";

import { CategoryContextRatesReader } from "../pim/catalogue/category/domain/ports/category-context-rates.reader.js";
import { ProductContextRatesReader } from "../pim/catalogue/product/domain/ports/product-context-rates.reader.js";
import { SalesContextRatingsReader } from "../pim/reference/sales-contexts/domain/ports/sales-context-ratings.reader.js";

/**
 * Ce que le CATALOGUE répond à la liste des contextes de vente : combien de
 * taux sont réglés sur chacun, familles et fiches additionnées.
 */
@Injectable()
export class PimCatalogueSalesContextRatings extends SalesContextRatingsReader {
  constructor(
    private readonly categories: CategoryContextRatesReader,
    private readonly products: ProductContextRatesReader,
  ) {
    super();
  }

  async ratedByContext(): Promise<ReadonlyMap<string, number>> {
    const [families, products] = await Promise.all([
      this.categories.countByContext(),
      this.products.countByContext(),
    ]);
    const rated = new Map(families);
    for (const [contextId, count] of products) {
      rated.set(contextId, (rated.get(contextId) ?? 0) + count);
    }
    return rated;
  }
}
