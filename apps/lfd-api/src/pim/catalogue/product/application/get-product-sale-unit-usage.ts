import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductSaleUnitUsageView } from "@lfd/pim-contracts";

import { SaleReferenceUsage } from "../../../channels/b2b-platform/sale-reference-usage/sale-reference-usage.js";
import { saleReferenceUseLabel } from "../domain/errors/sale-unit-errors.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import { orderedUses } from "../domain/value-objects/sale-reference-usage.js";
import { requireProduct } from "./product-support.js";
import { clearancesOf } from "./sale-unit-clearance-support.js";

export class GetProductSaleUnitUsageQuery {
  constructor(readonly productId: string) {}
}

/**
 * **Où chaque déclinaison de la fiche a déjà servi** — une lecture du
 * commerce par lot, par le port que le changement d'unité interroge aussi.
 *
 * L'écran s'en sert pour fermer le sélecteur d'unité et dire pourquoi avant
 * qu'on essaie ; le serveur garde son refus (`Variant.changeSaleTerms`). Une
 * panne du commerce rend `verified: false`, jamais une liste vide.
 */
@QueryHandler(GetProductSaleUnitUsageQuery)
export class GetProductSaleUnitUsageHandler implements IQueryHandler<
  GetProductSaleUnitUsageQuery,
  ProductSaleUnitUsageView
> {
  constructor(
    private readonly products: ProductRepository,
    private readonly usage: SaleReferenceUsage,
  ) {}

  async execute(query: GetProductSaleUnitUsageQuery): Promise<ProductSaleUnitUsageView> {
    const snapshot = (await requireProduct(this.products, query.productId)).snapshot();
    const references = snapshot.variants.map((variant) => ({
      sku: variant.sku,
      productSku: snapshot.sku,
      isDefault: variant.isDefault,
    }));
    const clearances = await clearancesOf(this.usage, references);
    return {
      variants: snapshot.variants.map((variant) => {
        const clearance = clearances.get(variant.sku);
        if (clearance === undefined || !clearance.answered) {
          return { variantId: variant.id, verified: false, uses: [], labels: [] };
        }
        const uses = orderedUses(clearance.uses);
        return {
          variantId: variant.id,
          verified: true,
          uses,
          labels: uses.map(saleReferenceUseLabel),
        };
      }),
    };
  }
}
