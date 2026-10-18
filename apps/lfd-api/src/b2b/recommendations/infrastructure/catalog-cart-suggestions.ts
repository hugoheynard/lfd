import type { ShopItemView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { ShopCataloguePricing } from "../../catalog/application/shop-catalogue-pricing.service.js";
import type { ShopAudience } from "../../catalog/domain/ports/catalog.reader.js";
import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import { CartFamilyReader } from "../domain/ports/cart-family.reader.js";
import { SuggestedArticleReader } from "../domain/ports/suggested-article.reader.js";

/** La lignée des familles du panier, lue au catalogue servi — sous le SKU du PRODUIT. */
@Injectable()
export class CatalogCartFamilyReader extends CartFamilyReader {
  constructor(private readonly catalog: ProductCatalogReader) {
    super();
  }

  async pathsOf(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, readonly string[]>> {
    if (skus.length === 0) {
      return new Map();
    }
    const served = await this.catalog.resolveMany(skus, audience);
    const paths = new Map<string, readonly string[]>();
    for (const [sku, item] of served) {
      if (item.family !== null) {
        paths.set(sku, item.family.path);
      }
    }
    return paths;
  }
}

/**
 * L'article suggéré, pris dans la vitrine elle-même (`ShopCataloguePricing`,
 * la logique des deux routes `/shop/catalogue`) : son prix est celui du rayon,
 * promotions et mercuriale comprises. La vitrine entière est tarifée pour en
 * garder un ou deux articles — le coût du rayon, porté par le cache des
 * matériaux de prix ; l'appelant ne la demande que s'il reste un candidat.
 */
@Injectable()
export class ShopSuggestedArticleReader extends SuggestedArticleReader {
  constructor(private readonly pricing: ShopCataloguePricing) {
    super();
  }

  async articles(
    skus: readonly string[],
    companyId: string | null,
  ): Promise<ReadonlyMap<string, ShopItemView>> {
    if (skus.length === 0) {
      return new Map();
    }
    const wanted = new Set(skus);
    const shelf = await this.pricing.priced(companyId);
    return new Map(
      shelf.items.filter((item) => wanted.has(item.sku)).map((item) => [item.sku, item]),
    );
  }
}
