import type { BinCapacitiesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryProductsReader } from "../../channels/commerce/delivery-products.reader.js";
import { BinCatalogReader } from "../../domain/ports/bin-catalog.reader.js";
import { GetBinCapacitiesQuery } from "./get-bin-capacities.query.js";

/**
 * La grille bacs × produits (L4b-C2, v2-2) : les produits viennent du canal
 * commerce, les types et les cases de la livraison. Les types archivés en sont
 * absents, et leurs cases avec eux.
 *
 * Une case d'un produit qui ne se vend plus reste en base et n'est pas servie
 * ici tant que le produit n'est pas relisté : la grille ne montre que ce qui
 * a une ligne.
 */
@QueryHandler(GetBinCapacitiesQuery)
export class GetBinCapacitiesHandler implements IQueryHandler<
  GetBinCapacitiesQuery,
  BinCapacitiesView
> {
  constructor(
    private readonly catalog: BinCatalogReader,
    private readonly products: DeliveryProductsReader,
  ) {}

  async execute(): Promise<BinCapacitiesView> {
    const [types, capacities, products] = await Promise.all([
      this.catalog.listTypes(),
      this.catalog.activeCapacities(),
      this.products.sold(),
    ]);
    const sold = new Set(products.map((product) => product.sku));
    return {
      products: products.map((product) => ({
        sku: product.sku,
        name: product.name,
        requiresCold: product.requiresCold,
      })),
      types: types.filter((type) => type.archivedAt === null),
      capacities: capacities.filter((capacity) => sold.has(capacity.sku)),
    };
  }
}
