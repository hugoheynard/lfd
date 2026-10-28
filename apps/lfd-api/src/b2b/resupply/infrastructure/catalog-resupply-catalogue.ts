import { Injectable } from "@nestjs/common";

import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../catalog/domain/ports/catalog.reader.js";
import { type ResupplyArticle, ResupplyCatalogue } from "../domain/resupply-catalogue.js";

/** La vitrine sert les particuliers : c'est leur catalogue qu'elle reçoit. */
const SHOP_AUDIENCE = "public";

/**
 * **Le catalogue publié, vu du réapprovisionnement** — sur `CatalogReader`
 * (la copie que le commerce tient du référentiel, par son canal). Le SKU du
 * PRODUIT, celui que portent les lignes de commande ; aucun prix ne traverse.
 */
@Injectable()
export class CatalogResupplyCatalogue extends ResupplyCatalogue {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async articles(): Promise<readonly ResupplyArticle[]> {
    const items = await this.catalog.listSellable(SHOP_AUDIENCE);
    // Un article au poids n'est pas proposé : un réassort ne compte que des
    // pièces (`plan-vente-au-poids.md`, §2) — et le demander est refusé.
    return items.filter((item) => item.isDefault && item.saleUnit === "piece").map(toArticle);
  }

  async article(sku: string): Promise<ResupplyArticle | null> {
    const item = await this.catalog.findDefaultByProductSku(sku, SHOP_AUDIENCE);
    return item === null ? null : toArticle(item);
  }
}

function toArticle(item: ResolvedCatalogItem): ResupplyArticle {
  return {
    sku: item.productSku,
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    saleUnit: item.saleUnit,
  };
}
