import { Injectable } from "@nestjs/common";

import { CatalogReader } from "../../catalog/domain/ports/catalog.reader.js";
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
    return items
      .filter((item) => item.isDefault)
      .map((item) => ({ sku: item.productSku, name: item.name }));
  }

  async article(sku: string): Promise<ResupplyArticle | null> {
    const item = await this.catalog.findDefaultByProductSku(sku, SHOP_AUDIENCE);
    return item === null ? null : { sku: item.productSku, name: item.name };
  }
}
