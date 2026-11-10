import { Injectable } from "@nestjs/common";

import type { ProPricedArticle } from "../../pricing/domain/promotion-decimals.js";
import { PromotionProPricesReader } from "../../promotions/domain/ports/promotion-pro-prices.reader.js";
import { staffViewer } from "../domain/catalog-viewer.js";
import { CatalogReader } from "../domain/ports/catalog.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";

/**
 * **Le catalogue pro, à son prix pro HT** (`documentation/promotions/plan-remise-par-ligne.md`,
 * § 18.7) — sous le SKU de vente, comme `CatalogPromotionCatalogueReader`,
 * pour qu'une cible `variant` le nomme. Le prix est `unitPriceMillicents` :
 * celui du commerce s'il existe, celui que la porte du prix prend pour base.
 */
@Injectable()
export class CatalogPromotionProPricesReader extends PromotionProPricesReader {
  constructor(private readonly catalog: CatalogReader) {
    super();
  }

  async proArticles(): Promise<readonly ProPricedArticle[]> {
    const items = await this.catalog.listSellable(staffViewer("pro"));
    return items.map((item) => ({
      sku: shopSkuOf(item),
      productSku: item.productSku,
      name: item.name,
      categoryPath: item.family.path,
      saleUnit: item.saleUnit,
      priceMillicents: item.unitPriceMillicents,
    }));
  }
}
