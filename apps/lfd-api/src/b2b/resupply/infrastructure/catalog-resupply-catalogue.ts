import { Injectable } from "@nestjs/common";
import { isShownAsTile, shopSkuOf } from "../../catalog/domain/shop-sku.js";

import {
  CatalogReader,
  type ResolvedCatalogItem,
} from "../../catalog/domain/ports/catalog.reader.js";
import { type ResupplyArticle, ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import { staffViewer } from "../../catalog/domain/catalog-viewer.js";

/** La vitrine sert les particuliers : c'est leur catalogue qu'elle reçoit. */
const SHOP_AUDIENCE = "public";

/**
 * **Le catalogue publié, vu du réapprovisionnement** — sur `CatalogReader`
 * (la copie que le commerce tient du référentiel, par son canal). Le SKU du
 * PRODUIT, celui que portent les lignes de commande ; aucun prix ne traverse.
 *
 * **Un seul critère pour proposer et pour valider : celui du rayon**
 * (`isShownAsTile` — le défaut, ou une déclinaison d'une fiche en vignette ;
 * décision E4 de l'audit final, 2026-11-03). La liste ne proposait que le
 * défaut, et la validation acceptait toute déclinaison vendue : un SKU d'une
 * déclinaison masquée passait par l'API, une déclinaison en vignette que la
 * vitrine vend n'était pas proposée.
 */
@Injectable()
export class CatalogResupplyCatalogue extends ResupplyCatalogue {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async articles(): Promise<readonly ResupplyArticle[]> {
    const items = await this.catalog.listSellable(staffViewer(SHOP_AUDIENCE));
    // Un article au poids est proposé depuis le réassort des articles au poids (L2b-4) : chaque
    // article porte son unité, et les écrans saisissent ses quantités en grammes.
    return items.filter(isShownAsTile).map(toArticle);
  }

  async article(sku: string): Promise<ResupplyArticle | null> {
    const item = await this.catalog.findByShopSku(sku, staffViewer(SHOP_AUDIENCE));
    return item === null || !isShownAsTile(item) ? null : toArticle(item);
  }
}

function toArticle(item: ResolvedCatalogItem): ResupplyArticle {
  return {
    sku: shopSkuOf(item),
    name: item.name,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    saleUnit: item.saleUnit,
  };
}
