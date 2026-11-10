import { Injectable } from "@nestjs/common";

import {
  type OrderLineClassification,
  OrderLineClassificationReader,
} from "../../../orders/domain/ports/order-line-classification.reader.js";
import { isShownAsTile, shopSkuOf } from "../../domain/shop-sku.js";
import { PrismaOrderLineClassificationReader } from "../prisma-order-line-classification.reader.js";
import { CatalogueSnapshotStore } from "./catalogue-snapshot.store.js";

/**
 * **Le classement des lignes sur l'instantané** (lecture C, § 2.4) : produit,
 * famille et sa lignée, sur mesure — les colonnes que l'instantané porte déjà.
 * Hors de la portée de l'instantané, la base comme avant.
 */
@Injectable()
export class SnapshotOrderLineClassificationReader extends OrderLineClassificationReader {
  constructor(
    private readonly base: PrismaOrderLineClassificationReader,
    private readonly store: CatalogueSnapshotStore,
  ) {
    super();
  }

  async classify(skus: readonly string[]): Promise<ReadonlyMap<string, OrderLineClassification>> {
    if (!this.store.serves()) {
      return this.base.classify(skus);
    }
    if (skus.length === 0) {
      return new Map();
    }
    const articles = await this.store.articles();
    const found = new Map<string, OrderLineClassification>();
    for (const sku of new Set(skus)) {
      const row = articles.bySku.get(sku);
      if (row !== undefined && isShownAsTile(row)) {
        found.set(shopSkuOf(row), {
          productId: row.productId,
          categoryId: row.categoryId,
          categoryPath: articles.lineage(row.categoryId).path,
          madeToOrder: row.customRecipe,
        });
      }
    }
    return found;
  }
}
