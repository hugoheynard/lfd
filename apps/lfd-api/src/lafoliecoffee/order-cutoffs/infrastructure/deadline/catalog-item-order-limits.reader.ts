import type { OrderLimitSpec } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { staffViewer } from "../../../catalog/domain/catalog-viewer.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import {
  ItemOrderLimitsReader,
  type DeadlineAudience,
} from "../../domain/deadline/ports/deadline-sources.js";

/**
 * {@link ItemOrderLimitsReader} par la lecture que le catalogue publie : la
 * limite résolue de chaque article, telle que le référentiel l'a descendue.
 *
 * Lue en regard de l'équipe (`staffViewer`) : la question juge un panier
 * qu'on compose, pas ce qu'une vitrine montrerait à un visiteur.
 */
@Injectable()
export class CatalogItemOrderLimitsReader extends ItemOrderLimitsReader {
  constructor(private readonly catalog: ProductCatalogReader) {
    super();
  }

  async limitsOf(
    skus: readonly string[],
    audience: DeadlineAudience,
  ): Promise<ReadonlyMap<string, OrderLimitSpec | null>> {
    if (skus.length === 0) {
      return new Map();
    }
    const items = await this.catalog.resolveMany(skus, staffViewer(audience));
    return new Map([...items].map(([sku, item]) => [sku, item.orderTimeLimit]));
  }
}
