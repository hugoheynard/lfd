import type { ShopItemView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { ShopCataloguePricing } from "../../catalog/application/shop-catalogue-pricing.service.js";
import { CATALOG_SOURCE_LANGUAGE } from "../../catalog/domain/catalog-translations.js";
import type { ShopAudience } from "../../catalog/domain/ports/catalog.reader.js";
import { ProductCatalogReader } from "../../catalog/domain/ports/product-catalog.reader.js";
import { CartFamilyReader } from "../domain/ports/cart-family.reader.js";
import { SuggestedArticleReader } from "../domain/ports/suggested-article.reader.js";
import { staffViewer } from "../../catalog/domain/catalog-viewer.js";

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
    // Les familles des SEULS articles du panier, qui ne sortent pas d'ici :
    // lecteur `staff` (`plan-articles-sur-mesure.md`, § 6).
    const served = await this.catalog.resolveMany(skus, staffViewer(audience));
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
 * promotions et mercuriale comprises. Seuls les articles demandés sont
 * tarifés (`pricedItems`, depuis le 2026-11-02) : la vitrine entière l'était
 * pour en garder un ou deux, trois à quatre fois par changement d'espace.
 * Sans société, la vitrine de l'audience demandée : `public` pour la
 * boutique, `pro` pour l'aperçu du staff.
 */
@Injectable()
export class ShopSuggestedArticleReader extends SuggestedArticleReader {
  constructor(private readonly pricing: ShopCataloguePricing) {
    super();
  }

  async articles(
    skus: readonly string[],
    companyId: string | null,
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, ShopItemView>> {
    if (skus.length === 0) {
      return new Map();
    }
    const items = await this.pricing.pricedItems(
      skus,
      // Une société résolue : la route reconnue.
      companyId === null ? { audience } : { companyId },
      CATALOG_SOURCE_LANGUAGE,
    );
    return new Map(items.map((item) => [item.sku, item]));
  }
}
