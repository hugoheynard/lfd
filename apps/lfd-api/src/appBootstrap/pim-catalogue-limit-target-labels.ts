import { Injectable } from "@nestjs/common";
import type { OrderTimeLimitScopeType } from "@lfd/pim-contracts";

import { CategoryNamesReader } from "../pim/catalogue/category/domain/ports/category-names.reader.js";
import { ProductSkusReader } from "../pim/catalogue/product/domain/ports/product-skus.reader.js";
import {
  LimitTargetLabelsReader,
  type ScopeTarget,
} from "../pim/order-time-limitation/domain/ports/limit-target-labels.reader.js";

/**
 * Ce que le CATALOGUE répond aux limites de commande : le nom de chaque cible
 * — une famille par son nom, un produit ou une déclinaison par son SKU.
 *
 * Trois lectures plutôt qu'une jointure : les cibles vivent dans trois tables
 * et Prisma n'a pas de relation polymorphe. Chacune est la lecture que la
 * famille ou la fiche publie.
 */
@Injectable()
export class PimCatalogueLimitTargetLabels extends LimitTargetLabelsReader {
  constructor(
    private readonly categories: CategoryNamesReader,
    private readonly products: ProductSkusReader,
  ) {
    super();
  }

  async labelsOf(targets: readonly ScopeTarget[]): Promise<ReadonlyMap<string, string>> {
    const idsOf = (type: OrderTimeLimitScopeType): string[] =>
      targets.flatMap((row) =>
        row.scopeType === type && row.scopeId !== null ? [row.scopeId] : [],
      );
    const [families, products, variants] = await Promise.all([
      this.categories.frenchNamesOf(idsOf("category")),
      this.products.productSkusOf(idsOf("product")),
      this.products.variantSkusOf(idsOf("variant")),
    ]);
    return new Map([...families, ...products, ...variants]);
  }
}
