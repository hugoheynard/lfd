import { Injectable } from "@nestjs/common";

import { OrderLineClassificationReader } from "../../orders/domain/ports/order-line-classification.reader.js";
import {
  type PromotionCatalogue,
  type PromotionCatalogueArticle,
  PromotionCatalogueReader,
} from "../../promotions/domain/ports/promotion-catalogue.reader.js";
import { staffViewer } from "../domain/catalog-viewer.js";
import { CatalogReader, type ResolvedCatalogItem } from "../domain/ports/catalog.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";

/**
 * **Le catalogue vendable, pour les promotions** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.2, lot L7) — ce que le refus de chevauchement compare et les noms que
 * l'écran montre.
 *
 * Sur le patron de `CatalogSellableArticlesReader` : les deux audiences, un
 * article vendu aux deux une seule fois, sous son SKU de vente. Chaque
 * déclinaison vendable compte, pas seulement le défaut : une promotion vise
 * une déclinaison. Le produit (`product_id`) vient du rangement que la caisse
 * lit déjà (`OrderLineClassificationReader`) — `listSellable` ne le porte pas.
 *
 * Toute panne remonte : un refus de chevauchement jugé sur un catalogue
 * partiel laisserait passer ce qu'il doit refuser.
 */
@Injectable()
export class CatalogPromotionCatalogueReader extends PromotionCatalogueReader {
  constructor(
    private readonly catalog: CatalogReader,
    private readonly classification: OrderLineClassificationReader,
  ) {
    super();
  }

  async snapshot(): Promise<PromotionCatalogue> {
    const [pro, shop] = await Promise.all([
      this.catalog.listSellable(staffViewer("pro")),
      this.catalog.listSellable(staffViewer("public")),
    ]);
    const bySku = new Map<string, ResolvedCatalogItem>();
    for (const item of [...pro, ...shop]) {
      if (!bySku.has(shopSkuOf(item))) {
        bySku.set(shopSkuOf(item), item);
      }
    }
    const classified = await this.classification.classify([...bySku.keys()]);
    const articles: PromotionCatalogueArticle[] = [];
    const categoryNames = new Map<string, string>();
    const productNames = new Map<string, string>();
    for (const [sku, item] of bySku) {
      const productId = classified.get(sku)?.productId ?? null;
      articles.push({
        sku,
        name: item.name,
        productId,
        categoryPath: item.family.path,
        saleUnit: item.saleUnit,
      });
      categoryNames.set(item.family.id, item.family.name);
      for (const ancestor of item.family.ancestors ?? []) {
        categoryNames.set(ancestor.id, ancestor.name);
      }
      if (productId !== null && item.isDefault) {
        productNames.set(productId, item.name);
      }
    }
    articles.sort((left, right) => left.name.localeCompare(right.name, "fr"));
    return { articles, categoryNames, productNames };
  }
}
