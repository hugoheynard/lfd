import { Injectable } from "@nestjs/common";

import { CategoryIdsReader } from "../../category/domain/ports/category-ids.reader.js";
import { ProductTalliesReader } from "../../product/domain/ports/product-tallies.reader.js";
import {
  CatalogOverviewReader,
  type OverviewProductRow,
} from "../domain/ports/catalog-overview.reader.js";

/**
 * Le compte du catalogue, composé de ce que la fiche et la famille publient :
 * les fiches comptées, puis les identifiants des familles — deux requêtes,
 * quelle que soit la taille du catalogue, et aucune table d'un voisin lue ici.
 */
@Injectable()
export class PrismaCatalogOverviewReader extends CatalogOverviewReader {
  constructor(
    private readonly products: ProductTalliesReader,
    private readonly categories: CategoryIdsReader,
  ) {
    super();
  }

  async productRows(): Promise<readonly OverviewProductRow[]> {
    const [tallies, known] = await Promise.all([this.products.tallies(), this.categories.allIds()]);
    return tallies.map((tally) => ({ ...tally, categoryKnown: known.has(tally.categoryId) }));
  }
}
