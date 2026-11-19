import { Injectable } from "@nestjs/common";

import { CategoryContextRatesReader } from "../pim/catalogue/category/domain/ports/category-context-rates.reader.js";
import { ProductContextRatesReader } from "../pim/catalogue/product/domain/ports/product-context-rates.reader.js";
import { SalesContextUsageReader } from "../pim/reference/sales-contexts/domain/ports/sales-context-usage.reader.js";

/**
 * Ce que le CATALOGUE répond à l'archive d'un contexte de vente : combien de
 * taux y sont réglés, famille ou fiche. Il additionne ce que la famille et la
 * fiche publient — les DEUX, toujours : l'oubli d'un seul laisserait archiver
 * un contexte qu'une fiche règle encore.
 */
@Injectable()
export class PimCatalogueSalesContextUsage extends SalesContextUsageReader {
  constructor(
    private readonly categories: CategoryContextRatesReader,
    private readonly products: ProductContextRatesReader,
  ) {
    super();
  }

  async ratedBy(contextId: string): Promise<number> {
    const [families, products] = await Promise.all([
      this.categories.countIn(contextId),
      this.products.countIn(contextId),
    ]);
    return families + products;
  }
}
