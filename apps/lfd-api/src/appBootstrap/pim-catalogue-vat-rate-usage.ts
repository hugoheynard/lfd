import { Injectable } from "@nestjs/common";

import { CategoryVatHoldersReader } from "../pim/catalogue/category/domain/ports/category-vat-holders.reader.js";
import { ProductVatHoldersReader } from "../pim/catalogue/product/domain/ports/product-vat-holders.reader.js";
import { VatRateUsageReader } from "../pim/reference/vat-rates/domain/ports/vat-rate-usage.reader.js";

/**
 * Ce que le CATALOGUE répond au référentiel des taux : combien de familles et
 * de fiches portent un taux. Le référentiel déclare la question, le catalogue
 * y répond — un référentiel de base ne lit pas le catalogue.
 *
 * Il ne lit aucune table : il additionne ce que la famille et la fiche
 * publient chacune. Les DEUX, toujours — l'oubli d'un seul laisserait archiver
 * un taux qu'une famille porte encore.
 */
@Injectable()
export class PimCatalogueVatRateUsage extends VatRateUsageReader {
  constructor(
    private readonly categories: CategoryVatHoldersReader,
    private readonly products: ProductVatHoldersReader,
  ) {
    super();
  }

  async holdersOf(rateId: string): Promise<number> {
    const [families, products] = await Promise.all([
      this.categories.countHolding(rateId),
      this.products.countHolding(rateId),
    ]);
    return families + products;
  }
}
