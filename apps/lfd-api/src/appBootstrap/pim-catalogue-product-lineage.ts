import { Injectable } from "@nestjs/common";

import { CategoryChainReader } from "../pim/catalogue/category/domain/ports/category-chain.reader.js";
import { ProductPlacementReader } from "../pim/catalogue/product/domain/ports/product-placement.reader.js";
import { ProductLineageReader } from "../pim/order-time-limitation/domain/ports/product-lineage.reader.js";

/**
 * Ce que le CATALOGUE répond aux limites de commande sur le rangement d'une
 * fiche : sa famille (`ProductPlacementReader`), puis la chaîne de ses
 * ancêtres (`CategoryChainReader`) — deux lectures que la fiche et la famille
 * publient, aucune table lue ici.
 */
@Injectable()
export class PimCatalogueProductLineage extends ProductLineageReader {
  constructor(
    private readonly placements: ProductPlacementReader,
    private readonly chains: CategoryChainReader,
  ) {
    super();
  }

  async lineageOf(productId: string): Promise<readonly string[] | null> {
    const placement = await this.placements.placementOf(productId);
    if (placement === null) {
      return null;
    }
    const chain = await this.chains.chainOf(placement.categoryId);
    return chain.map((link) => link.id);
  }

  async familyExists(categoryId: string): Promise<boolean> {
    return (await this.chains.chainOf(categoryId)).length > 0;
  }
}
